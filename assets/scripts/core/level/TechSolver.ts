import { neighborIndexes } from '../puzzle/PuzzleRules';
import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';

export type TechId = 0 | 1 | 2 | 3 | 4;

export interface LevelHint {
  text: string;
  textParams?: { region?: number; row?: number; cell?: number };
  highlightCells: number[];
  highlightRegions: number[];
  crossOutCells: number[];
  pointerCell: number | null;
  step: number;
  totalSteps: number;
}

export type FirstActionKind = 'T0' | 'T1a' | 'T1b' | 'T2' | 'T3' | 'T4';

export interface TechAnnotateResult {
  requiredTech: TechId;
  techCombo: TechId[];
  /** A1 places + A2 exclude apps + A3 try/backtrack. */
  chainLength: number;
  branchDepth: number;
  noGuess: boolean;
  solved: boolean;
  /** First meaningful teaching action for guide levels. */
  firstAction: null | {
    kind: FirstActionKind;
    placeCell?: number;
    excludeCells?: number[];
    focusCells?: number[];
    regionIds?: number[];
    axis?: 'row' | 'col';
    line?: number;
  };
}

type T1Mode = 'full' | 'a' | 'b';

interface SolverState {
  blocked: boolean[];
  cats: number[];
  catSet: Set<number>;
}

interface AnnotateOpts {
  t1Mode?: T1Mode;
  initialCats?: number[];
  /** If set, only these techs may be applied when stuck (omit = allow all). */
  allowedTechs?: TechId[];
  /** Pigeonhole combination size for T3 (default 2). */
  pigeonK?: 2 | 3;
}

interface AnnotateStats {
  places: number;
  excludeApps: number;
  tryBacktracks: number;
  branchDepth: number;
  used: Set<TechId>;
  techOrder: TechId[];
  /** Techniques applied while T0 had no forced place (stuck → progress). */
  requiredUsed: Set<TechId>;
  requiredOrder: TechId[];
  firstT0: TechAnnotateResult['firstAction'];
  /** Exclude applied when stuck (T1/T2/T3/T4), before any T0 place. */
  firstStuckExclude: TechAnnotateResult['firstAction'];
  t1Mode: T1Mode;
  /** Cats whose T1 clears have not been applied yet (e.g. initialCats). */
  pendingT1: Set<number>;
  allowedTechs?: TechId[];
  pigeonK: 2 | 3;
}

function techAllowed(stats: AnnotateStats, id: TechId): boolean {
  if (!stats.allowedTechs) return true;
  return stats.allowedTechs.includes(id);
}

function noteTech(stats: AnnotateStats, id: TechId): void {
  if (!stats.used.has(id)) {
    stats.used.add(id);
    stats.techOrder.push(id);
  }
}

function noteRequired(stats: AnnotateStats, id: TechId): void {
  noteTech(stats, id);
  if (!stats.requiredUsed.has(id)) {
    stats.requiredUsed.add(id);
    stats.requiredOrder.push(id);
  }
}

function cloneState(state: SolverState): SolverState {
  return {
    blocked: state.blocked.slice(),
    cats: state.cats.slice(),
    catSet: new Set(state.catSet),
  };
}

/**
 * Technique-layered candidacy: only blocked marks and occupied cells.
 * Row/col/region/adjacency are introduced via T1 clears (bundled or pending).
 */
function isCandidate(_level: LevelDefinition, state: SolverState, index: number): boolean {
  if (state.blocked[index]) return false;
  if (state.catSet.has(index)) return false;
  return true;
}

/** True when two placed cats break queens rules (same line/region/adjacent). */
function catsViolateRules(level: LevelDefinition, state: SolverState): boolean {
  const size = level.size;
  const cats = state.cats;
  for (let i = 0; i < cats.length; i++) {
    const a = cats[i]!;
    const ra = rowOf(a, size);
    const ca = colOf(a, size);
    const regionA = level.regions[a]!;
    for (let j = i + 1; j < cats.length; j++) {
      const b = cats[j]!;
      if (rowOf(b, size) === ra) return true;
      if (colOf(b, size) === ca) return true;
      if (level.regions[b] === regionA) return true;
      if (neighborIndexes(a, size).includes(b)) return true;
    }
  }
  return false;
}

function listCandidates(level: LevelDefinition, state: SolverState): number[] {
  const out: number[] = [];
  const n = level.size * level.size;
  for (let i = 0; i < n; i++) {
    if (isCandidate(level, state, i)) out.push(i);
  }
  return out;
}

function hasContradiction(level: LevelDefinition, state: SolverState): boolean {
  const size = level.size;
  if (state.cats.length > size) return true;
  if (catsViolateRules(level, state)) return true;
  const cands = listCandidates(level, state);
  const rowHas = Array.from({ length: size }, () => false);
  const colHas = Array.from({ length: size }, () => false);
  const regionHas = Array.from({ length: size }, () => false);
  for (const cat of state.cats) {
    rowHas[rowOf(cat, size)] = true;
    colHas[colOf(cat, size)] = true;
    regionHas[level.regions[cat]!] = true;
  }
  for (let r = 0; r < size; r++) {
    if (rowHas[r]) continue;
    if (!cands.some((i) => rowOf(i, size) === r)) return true;
  }
  for (let c = 0; c < size; c++) {
    if (colHas[c]) continue;
    if (!cands.some((i) => colOf(i, size) === c)) return true;
  }
  for (let rid = 0; rid < size; rid++) {
    if (regionHas[rid]) continue;
    if (!cands.some((i) => level.regions[i] === rid)) return true;
  }
  return false;
}

function findForced(level: LevelDefinition, state: SolverState): number[] {
  const size = level.size;
  const cands = listCandidates(level, state);
  const forced = new Set<number>();

  const rowHas = Array.from({ length: size }, () => false);
  const colHas = Array.from({ length: size }, () => false);
  const regionHas = Array.from({ length: size }, () => false);
  for (const cat of state.cats) {
    rowHas[rowOf(cat, size)] = true;
    colHas[colOf(cat, size)] = true;
    regionHas[level.regions[cat]!] = true;
  }

  for (let r = 0; r < size; r++) {
    if (rowHas[r]) continue;
    const cells = cands.filter((i) => rowOf(i, size) === r);
    if (cells.length === 1) forced.add(cells[0]!);
  }
  for (let c = 0; c < size; c++) {
    if (colHas[c]) continue;
    const cells = cands.filter((i) => colOf(i, size) === c);
    if (cells.length === 1) forced.add(cells[0]!);
  }
  for (let rid = 0; rid < size; rid++) {
    if (regionHas[rid]) continue;
    const cells = cands.filter((i) => level.regions[i] === rid);
    if (cells.length === 1) forced.add(cells[0]!);
  }

  return [...forced].sort((a, b) => a - b);
}

/** Collect cells a T1 mode would clear from `index` (does not mutate). */
function t1ClearTargets(
  level: LevelDefinition,
  index: number,
  mode: T1Mode,
): number[] {
  const size = level.size;
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const region = level.regions[index]!;
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (i: number) => {
    if (i === index || seen.has(i)) return;
    seen.add(i);
    out.push(i);
  };

  if (mode === 'full' || mode === 'a') {
    for (let i = 0; i < size * size; i++) {
      if (rowOf(i, size) === r || colOf(i, size) === c) add(i);
    }
  }
  if (mode === 'full') {
    for (let i = 0; i < size * size; i++) {
      if (level.regions[i] === region) add(i);
    }
  }
  if (mode === 'full' || mode === 'b') {
    for (const n of neighborIndexes(index, size)) add(n);
  }
  return out;
}

/** Apply T1 clears after a place; returns newly blocked cell indexes. */
function applyT1Clears(
  level: LevelDefinition,
  state: SolverState,
  index: number,
  mode: T1Mode,
): number[] {
  const cleared: number[] = [];
  for (const i of t1ClearTargets(level, index, mode)) {
    if (state.blocked[i] || state.catSet.has(i)) continue;
    state.blocked[i] = true;
    cleared.push(i);
  }
  return cleared;
}

/**
 * Place a cat and apply full rule clears (engine correctness).
 * Mode only affects teaching attribution elsewhere (pending T1 / hints).
 */
function placeCat(
  level: LevelDefinition,
  state: SolverState,
  index: number,
  _mode: T1Mode,
): number[] {
  state.cats.push(index);
  state.catSet.add(index);
  state.blocked[index] = true;
  // Always full clears when bundling with a fresh place.
  return applyT1Clears(level, state, index, 'full');
}

/** Seed a cat without T1 clears (initialCats / deferred excludes). */
function seedCatNoClear(state: SolverState, index: number, stats: AnnotateStats): void {
  if (state.catSet.has(index)) return;
  state.cats.push(index);
  state.catSet.add(index);
  state.blocked[index] = true;
  stats.pendingT1.add(index);
}

/**
 * When T0 is stuck: apply pending T1 clears from seeded cats.
 * Bumps requiredTech to 1; firstAction kind is T1a/T1b from mode.
 * Skipped when allowedTechs is set and does not include 1.
 */
function applyPendingT1Clears(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
): boolean {
  if (stats.pendingT1.size === 0) return false;
  if (!techAllowed(stats, 1)) return false;
  const mode = stats.t1Mode;
  for (const cat of [...stats.pendingT1].sort((a, b) => a - b)) {
    stats.pendingT1.delete(cat);
    // Full clears keep the engine legal; teaching highlight uses mode subset.
    const fullCleared = applyT1Clears(level, state, cat, 'full');
    if (fullCleared.length === 0) continue;

    const teachTargets = new Set(t1ClearTargets(level, cat, mode === 'full' ? 'a' : mode));
    const teachCleared = fullCleared.filter((i) => teachTargets.has(i));
    const excludeCells = (teachCleared.length > 0 ? teachCleared : fullCleared).slice();

    if (record) {
      stats.excludeApps += 1;
      noteRequired(stats, 1);
      const kind: FirstActionKind = mode === 'b' ? 'T1b' : 'T1a';
      captureFirstStuckExclude(stats, {
        kind,
        placeCell: cat,
        excludeCells,
        focusCells: [cat, ...excludeCells],
        regionIds: [level.regions[cat]!],
        axis: mode === 'b' ? undefined : 'row',
        line: mode === 'b' ? undefined : rowOf(cat, level.size),
      });
    }
    return true;
  }
  return false;
}

function captureFirstT0(stats: AnnotateStats, cell: number, level: LevelDefinition): void {
  if (stats.firstT0 || stats.firstStuckExclude) return;
  stats.firstT0 = {
    kind: 'T0',
    placeCell: cell,
    focusCells: [cell],
    regionIds: [level.regions[cell]!],
  };
}

function captureFirstStuckExclude(
  stats: AnnotateStats,
  action: NonNullable<TechAnnotateResult['firstAction']>,
): void {
  if (stats.firstStuckExclude || stats.firstT0) return;
  if (!action.excludeCells || action.excludeCells.length === 0) return;
  stats.firstStuckExclude = action;
}

/**
 * T0 place + T1 clear. Returns true if a cat was placed.
 * After place, caller must rescan from T0.
 */
function applyT0(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
): boolean {
  const forced = findForced(level, state);
  if (forced.length === 0) return false;
  const cell = forced[0]!;
  if (!isCandidate(level, state, cell)) return false;

  placeCat(level, state, cell, stats.t1Mode);
  if (record) {
    stats.places += 1;
    // T0 place never bumps requiredTech. Bundled physics clears after a fresh
    // place do not note tech 1 — only pending/stuck T1 notes tech 1.
    noteTech(stats, 0);
    captureFirstT0(stats, cell, level);
  }
  return true;
}

/** T2: region open cells pinned to one row/col → exclude foreign cells on that line. */
function applyT2(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
): boolean {
  if (!techAllowed(stats, 2)) return false;
  const size = level.size;
  const cands = listCandidates(level, state);
  const regionHas = Array.from({ length: size }, () => false);
  for (const cat of state.cats) regionHas[level.regions[cat]!] = true;

  for (let rid = 0; rid < size; rid++) {
    if (regionHas[rid]) continue;
    const open = cands.filter((i) => level.regions[i] === rid);
    if (open.length < 1) continue;

    const r0 = rowOf(open[0]!, size);
    const c0 = colOf(open[0]!, size);
    const sameRow = open.every((i) => rowOf(i, size) === r0);
    const sameCol = open.every((i) => colOf(i, size) === c0);
    if (!sameRow && !sameCol) continue;

    const axis: 'row' | 'col' = sameRow ? 'row' : 'col';
    const line = sameRow ? r0 : c0;
    const exclude: number[] = [];
    for (const i of cands) {
      if (level.regions[i] === rid) continue;
      const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
      if (!onLine) continue;
      exclude.push(i);
    }
    if (exclude.length === 0) continue;

    for (const i of exclude) state.blocked[i] = true;
    if (record) {
      stats.excludeApps += 1;
      noteRequired(stats, 2);
      const focus = [...new Set([...open, ...exclude])].sort((a, b) => a - b);
      captureFirstStuckExclude(stats, {
        kind: 'T2',
        excludeCells: exclude,
        focusCells: focus,
        regionIds: [rid],
        axis,
        line,
      });
    }
    return true;
  }
  return false;
}

function popcount(mask: number): number {
  let n = 0;
  for (let t = mask; t; t >>= 1) n += t & 1;
  return n;
}

function combos(arr: number[], n: number): number[][] {
  if (n === 0) return [[]];
  if (arr.length < n) return [];
  const out: number[][] = [];
  const rec = (start: number, path: number[]) => {
    if (path.length === n) {
      out.push(path.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]!);
      rec(i + 1, path);
      path.pop();
    }
  };
  rec(0, []);
  return out;
}

/** T3: pigeonK regions in exactly pigeonK lines → exclude foreign open cells on those lines. */
function applyT3(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
): boolean {
  if (!techAllowed(stats, 3)) return false;
  const size = level.size;
  const k = stats.pigeonK;
  const cands = listCandidates(level, state);
  const regionHas = Array.from({ length: size }, () => false);
  for (const cat of state.cats) regionHas[level.regions[cat]!] = true;

  const openByRegion: number[][] = Array.from({ length: size }, () => []);
  for (const i of cands) openByRegion[level.regions[i]!]!.push(i);

  const active: number[] = [];
  for (let rid = 0; rid < size; rid++) {
    if (!regionHas[rid] && openByRegion[rid]!.length > 0) active.push(rid);
  }
  if (active.length < k) return false;

  const tryAxis = (axis: 'row' | 'col'): boolean => {
    const regionLines: number[] = Array.from({ length: size }, () => 0);
    for (const rid of active) {
      let mask = 0;
      for (const cell of openByRegion[rid]!) {
        const line = axis === 'row' ? rowOf(cell, size) : colOf(cell, size);
        mask |= 1 << line;
      }
      regionLines[rid] = mask;
    }

    // Only enumerate combinations of size pigeonK (default 2; k=3 only if requested).
    for (const combo of combos(active, k)) {
      let union = 0;
      for (const rid of combo) union |= regionLines[rid]!;
      if (popcount(union) !== k) continue;

      const lines: number[] = [];
      for (let i = 0; i < size; i++) if (union & (1 << i)) lines.push(i);
      const regionSet = new Set(combo);
      const exclude: number[] = [];
      for (const i of cands) {
        const line = axis === 'row' ? rowOf(i, size) : colOf(i, size);
        if (!lines.includes(line)) continue;
        if (regionSet.has(level.regions[i]!)) continue;
        exclude.push(i);
      }
      if (exclude.length === 0) continue;

      for (const i of exclude) state.blocked[i] = true;
      if (record) {
        stats.excludeApps += 1;
        noteRequired(stats, 3);
        const focus = new Set<number>();
        for (const rid of combo) for (const c of openByRegion[rid]!) focus.add(c);
        for (const i of exclude) focus.add(i);
        captureFirstStuckExclude(stats, {
          kind: 'T3',
          excludeCells: exclude,
          focusCells: [...focus].sort((a, b) => a - b),
          regionIds: [...combo],
          axis,
          line: lines[0],
        });
      }
      return true;
    }
    return false;
  };

  return tryAxis('row') || tryAxis('col');
}

/**
 * Propagate with T0–T3 only (no new T4). Returns contradiction / progress / stuck.
 */
function propagateNoGuess(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
): 'contradiction' | 'progress' | 'stuck' | 'solved' {
  let any = false;
  let guard = level.size * level.size * 4 + 8;
  while (state.cats.length < level.size && guard-- > 0) {
    if (hasContradiction(level, state)) return 'contradiction';
    if (applyT0(level, state, stats, record)) {
      any = true;
      continue;
    }
    // T0 stuck → apply deferred T1 clears from seeded / pending cats.
    if (applyPendingT1Clears(level, state, stats, record)) {
      any = true;
      continue;
    }
    if (applyT2(level, state, stats, record)) {
      any = true;
      continue;
    }
    if (applyT3(level, state, stats, record)) {
      any = true;
      continue;
    }
    break;
  }
  if (hasContradiction(level, state)) return 'contradiction';
  if (state.cats.length >= level.size) return 'solved';
  return any ? 'progress' : 'stuck';
}

/** Open candidates that sit in a region with exactly 2 open candidates. */
function size2CandidateCells(level: LevelDefinition, state: SolverState): number[] {
  const size = level.size;
  const cands = listCandidates(level, state);
  const byRegion = new Map<number, number[]>();
  for (const i of cands) {
    const rid = level.regions[i]!;
    const list = byRegion.get(rid);
    if (list) list.push(i);
    else byRegion.set(rid, [i]);
  }
  const out: number[] = [];
  for (const cells of byRegion.values()) {
    if (cells.length === 2) out.push(...cells);
  }
  // Also consider binary rows/cols when no size-2 region is available.
  if (out.length === 0) {
    const rowHas = Array.from({ length: size }, () => false);
    const colHas = Array.from({ length: size }, () => false);
    for (const cat of state.cats) {
      rowHas[rowOf(cat, size)] = true;
      colHas[colOf(cat, size)] = true;
    }
    for (let r = 0; r < size; r++) {
      if (rowHas[r]) continue;
      const cells = cands.filter((i) => rowOf(i, size) === r);
      if (cells.length === 2) out.push(...cells);
    }
    for (let c = 0; c < size; c++) {
      if (colHas[c]) continue;
      const cells = cands.filter((i) => colOf(i, size) === c);
      if (cells.length === 2) for (const i of cells) if (!out.includes(i)) out.push(i);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * T4: try placing a size-2 candidate; if propagate contradicts, exclude it.
 * Nested tries increase branchDepth.
 */
function applyT4(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
  depth: number,
): boolean {
  if (!techAllowed(stats, 4)) return false;
  const cells = size2CandidateCells(level, state);
  for (const cell of cells) {
    if (!isCandidate(level, state, cell)) continue;

    if (record) {
      stats.tryBacktracks += 1;
      noteRequired(stats, 4);
      if (depth > stats.branchDepth) stats.branchDepth = depth;
    }

    const trial = cloneState(state);
    const trialStats: AnnotateStats = {
      places: 0,
      excludeApps: 0,
      tryBacktracks: 0,
      branchDepth: depth,
      used: new Set(),
      techOrder: [],
      requiredUsed: new Set(),
      requiredOrder: [],
      firstT0: null,
      firstStuckExclude: null,
      t1Mode: stats.t1Mode,
      pendingT1: new Set(),
      allowedTechs: stats.allowedTechs,
      pigeonK: stats.pigeonK,
    };
    placeCat(level, trial, cell, stats.t1Mode);
    const outcome = solveFrom(level, trial, trialStats, false, depth);

    if (outcome === 'contradiction') {
      state.blocked[cell] = true;
      if (record) {
        stats.excludeApps += 1;
        noteRequired(stats, 4);
        if (trialStats.branchDepth > stats.branchDepth) {
          stats.branchDepth = trialStats.branchDepth;
        }
        captureFirstStuckExclude(stats, {
          kind: 'T4',
          placeCell: cell,
          excludeCells: [cell],
          focusCells: [cell],
          regionIds: [level.regions[cell]!],
        });
      }
      return true;
    }

    if (record && trialStats.branchDepth > stats.branchDepth) {
      stats.branchDepth = trialStats.branchDepth;
    }
  }
  return false;
}

function solveFrom(
  level: LevelDefinition,
  state: SolverState,
  stats: AnnotateStats,
  record: boolean,
  depth: number,
): 'solved' | 'contradiction' | 'stuck' {
  let guard = level.size * level.size * 8 + 16;
  while (state.cats.length < level.size && guard-- > 0) {
    if (hasContradiction(level, state)) return 'contradiction';

    const ng = propagateNoGuess(level, state, stats, record);
    if (ng === 'contradiction') return 'contradiction';
    if (ng === 'solved') return 'solved';
    if (ng === 'progress') continue;

    // Stuck on T0–T3 → try T4
    if (applyT4(level, state, stats, record, depth + 1)) continue;

    return hasContradiction(level, state) ? 'contradiction' : 'stuck';
  }
  if (state.cats.length >= level.size) {
    return hasContradiction(level, state) ? 'contradiction' : 'solved';
  }
  return hasContradiction(level, state) ? 'contradiction' : 'stuck';
}

function solutionMatches(level: LevelDefinition, cats: number[]): boolean {
  const expected = level.solution;
  if (!expected || expected.length === 0) return true;
  const a = [...expected].sort((x, y) => x - y);
  const b = [...cats].sort((x, y) => x - y);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Annotate which techniques are required to solve a Queens-like Cat Queens level.
 * Pass `initialCats` to seed cats without T1 clears (T1a/T1b guides).
 * Pass `allowedTechs` to restrict stuck techniques; restricted failure → solved:false.
 */
export function annotateLevel(
  level: LevelDefinition,
  opts?: AnnotateOpts,
): TechAnnotateResult {
  const t1Mode: T1Mode = opts?.t1Mode ?? 'full';
  const pigeonK: 2 | 3 = opts?.pigeonK ?? 2;
  const state: SolverState = {
    blocked: Array.from({ length: level.size * level.size }, () => false),
    cats: [],
    catSet: new Set(),
  };
  const stats: AnnotateStats = {
    places: 0,
    excludeApps: 0,
    tryBacktracks: 0,
    branchDepth: 0,
    used: new Set(),
    techOrder: [],
    requiredUsed: new Set(),
    requiredOrder: [],
    firstT0: null,
    firstStuckExclude: null,
    t1Mode,
    pendingT1: new Set(),
    allowedTechs: opts?.allowedTechs,
    pigeonK,
  };

  if (opts?.initialCats?.length) {
    for (const cat of opts.initialCats) {
      if (cat < 0 || cat >= level.size * level.size) continue;
      seedCatNoClear(state, cat, stats);
    }
  }

  const outcome = solveFrom(level, state, stats, true, 0);
  const solved = outcome === 'solved' && solutionMatches(level, state.cats);
  const requiredTech: TechId =
    stats.requiredOrder.length === 0
      ? 0
      : (Math.max(...stats.requiredOrder) as TechId);

  return {
    requiredTech,
    // Only techs that were actually applied (T0 places + stuck/pending excludes).
    techCombo: stats.techOrder.slice() as TechId[],
    chainLength: stats.places + stats.excludeApps + stats.tryBacktracks,
    branchDepth: stats.branchDepth,
    // noGuess ⇔ requiredTech ≤ 3 (T4 = guess).
    noGuess: solved && requiredTech <= 3,
    solved,
    // Prefer stuck-exclude (T1 / line-pin / pigeon / guess); else first T0 place.
    firstAction: stats.firstStuckExclude ?? stats.firstT0,
  };
}

/**
 * Build a player-facing hint from a teaching firstAction.
 */
export function buildHintFromAction(
  level: LevelDefinition,
  action: NonNullable<TechAnnotateResult['firstAction']>,
  kind: FirstActionKind,
): LevelHint | null {
  if (!action) return null;
  const highlightCells = (action.focusCells ?? action.excludeCells ?? (action.placeCell != null ? [action.placeCell] : [])).slice();
  const crossOutCells = (action.excludeCells ?? []).slice();
  const highlightRegions = (action.regionIds ?? []).slice();
  const pointerCell =
    action.placeCell ??
    (crossOutCells.length > 0 ? crossOutCells[0]! : highlightCells[0] ?? null);

  const region = action.regionIds?.[0];
  const axis = action.axis;
  const line = action.line;

  let text = '';
  const textParams: LevelHint['textParams'] = {};
  if (region != null) textParams.region = region;
  if (line != null) textParams.row = line;
  if (action.placeCell != null) textParams.cell = action.placeCell;

  switch (kind) {
    case 'T0':
      text = '这一格只剩一个位置可以放小猫';
      break;
    case 'T1a': {
      const lineWord = axis === 'col' ? '列' : '行';
      text = `由于 {region} 中一定有一只小猫，所以这一${lineWord}其他格子可以先划掉排除`;
      break;
    }
    case 'T1b':
      text = '小猫旁边八格都不能放猫，所以这些格子可以划掉';
      break;
    case 'T2': {
      const lineWord = axis === 'col' ? '列' : '行';
      text = `{region} 完全落在同一${lineWord}，这一${lineWord}的猫一定在它里面`;
      break;
    }
    case 'T3': {
      const lineWord = axis === 'col' ? '列' : '行';
      text = `这两个色区占了同样多的${lineWord}，这些${lineWord}的猫只能来自它们`;
      break;
    }
    case 'T4':
      text = '这里有两种可能，先试试这格放猫，不行就换另一个';
      break;
    default:
      return null;
  }

  // Touch level so callers can pass it for future board-aware copy without unused warnings.
  void level.size;

  return {
    text,
    textParams: Object.keys(textParams).length ? textParams : undefined,
    highlightCells,
    highlightRegions,
    crossOutCells,
    pointerCell,
    step: 1,
    totalSteps: 1,
  };
}
