import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { neighborIndexes } from '../puzzle/PuzzleRules';
import { firstForcedPlacement } from './LevelDifficulty';
import { coachGuideKeyForLevel, type GuideKey, type TechniqueId } from './LevelTechniques';

/** Player must exclude or place a cat on the guided cells. */
export type CoachAction = 'EXCLUDE' | 'PLACE_CAT';

/**
 * One interactive board step: spotlight focus cells, require action on targets.
 * `messageKey` may contain `{region}` for an inline color chip.
 * Prefer `messageText` when the level ships a pre-built Chinese hint.
 */
export interface CoachStep {
  technique: TechniqueId;
  action: CoachAction;
  focusCells: number[];
  targetCells: number[];
  /** Primary region for a single color chip. */
  regionId?: number;
  /** Multi-region tips (e.g. T2 pigeonhole) — show all chips in the bubble. */
  regionIds?: number[];
  axis?: 'row' | 'col';
  messageKey: string;
  /** Pre-rendered Chinese copy from LevelDefinition.hint (skips i18n). */
  messageText?: string;
}

const MAX_COACH_TARGETS = 4;

function regionBuckets(level: LevelDefinition): number[][] {
  const buckets: number[][] = Array.from({ length: level.size }, () => []);
  for (let i = 0; i < level.regions.length; i++) {
    buckets[level.regions[i]!]!.push(i);
  }
  return buckets;
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
      out.push([...path]);
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

function capTargets(cells: number[]): number[] {
  return [...cells].sort((a, b) => a - b).slice(0, MAX_COACH_TARGETS);
}

/**
 * Score a T1 demo: reference-style is a short pin (2–3 cells) that clears
 * several other cells on the line — that feels powerful, not fiddly.
 */
function scoreLinePinDemo(excludeCount: number, regionSize: number): number {
  let score = 0;
  if (excludeCount >= 2 && excludeCount <= 3) score += 200 - Math.abs(3 - excludeCount) * 15;
  else if (excludeCount === 1) score += 20;
  else score += 80 + Math.min(excludeCount, 4);
  if (regionSize === 2) score += 40;
  else if (regionSize === 3) score += 25;
  return score;
}

/** Prefer clearing 2–4 foreign cells on a tight pigeon band. */
function scorePigeonDemo(excludeCount: number, k: number): number {
  let score = 0;
  if (excludeCount >= 2 && excludeCount <= 4) score += 180 - Math.abs(3 - excludeCount) * 12;
  else if (excludeCount === 1) score += 25;
  else score += 60;
  score += k * 15;
  return score;
}

export interface LinePinExcludeDemo {
  regionId: number;
  axis: 'row' | 'col';
  excludeCells: number[];
  focusCells: number[];
  regionSize: number;
}

/** Best line-pin clear (full exclude list, for quality checks / coach). */
export function findBestLinePinExclude(level: LevelDefinition): LinePinExcludeDemo | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  let best: LinePinExcludeDemo | null = null;
  let bestScore = -1;

  for (let rid = 0; rid < size; rid++) {
    const cells = buckets[rid]!;
    if (cells.length < 2) continue;
    const r0 = rowOf(cells[0]!, size);
    const c0 = colOf(cells[0]!, size);
    const sameRow = cells.every((i) => rowOf(i, size) === r0);
    const sameCol = cells.every((i) => colOf(i, size) === c0);
    if (!sameRow && !sameCol) continue;

    const axis: 'row' | 'col' = sameRow ? 'row' : 'col';
    const line = sameRow ? r0 : c0;
    const exclude: number[] = [];
    const focus: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
      if (!onLine) continue;
      focus.push(i);
      if (level.regions[i] !== rid) exclude.push(i);
    }
    if (exclude.length === 0) continue;

    const score = scoreLinePinDemo(exclude.length, cells.length);
    if (score > bestScore) {
      bestScore = score;
      best = {
        regionId: rid,
        axis,
        excludeCells: exclude,
        focusCells: focus,
        regionSize: cells.length,
      };
    }
  }
  return best;
}

/** Region fully contained in one row or one column (size ≥ 2). */
function findLinePinExclude(level: LevelDefinition): CoachStep | null {
  const demo = findBestLinePinExclude(level);
  if (!demo) return null;
  return {
    technique: 'T1',
    action: 'EXCLUDE',
    focusCells: demo.focusCells,
    targetCells: capTargets(demo.excludeCells),
    regionId: demo.regionId,
    axis: demo.axis,
    messageKey: demo.axis === 'row' ? 'coach.T1_row' : 'coach.T1_col',
  };
}

export interface PigeonExcludeDemo {
  axis: 'row' | 'col';
  regionIds: number[];
  /** All foreign cells on the pigeon lines (uncapped). */
  excludeCells: number[];
  focusCells: number[];
}

/** Best k-region pigeonhole clear (full exclude list, for quality checks). */
export function findBestPigeonExclude(
  level: LevelDefinition,
  k: number,
): PigeonExcludeDemo | null {
  if (k < 2 || level.size < k) return null;
  const size = level.size;
  const buckets = regionBuckets(level);
  const ids = Array.from({ length: size }, (_, i) => i);

  const tryAxis = (axis: 'row' | 'col'): PigeonExcludeDemo | null => {
    const regionLines: number[] = [];
    for (let rid = 0; rid < size; rid++) {
      let mask = 0;
      for (const cell of buckets[rid]!) {
        const line = axis === 'row' ? rowOf(cell, size) : colOf(cell, size);
        mask |= 1 << line;
      }
      regionLines.push(mask);
    }

    let best: PigeonExcludeDemo | null = null;
    let bestScore = -1;
    for (const combo of combos(ids, k)) {
      let union = 0;
      for (const rid of combo) union |= regionLines[rid]!;
      if (popcount(union) !== k) continue;

      const lines: number[] = [];
      for (let i = 0; i < size; i++) if (union & (1 << i)) lines.push(i);
      const regionSet = new Set(combo);
      const exclude: number[] = [];
      const focus: number[] = [];
      for (const rid of combo) for (const c of buckets[rid]!) focus.push(c);

      for (let i = 0; i < size * size; i++) {
        const line = axis === 'row' ? rowOf(i, size) : colOf(i, size);
        if (!lines.includes(line)) continue;
        if (!focus.includes(i)) focus.push(i);
        if (!regionSet.has(level.regions[i]!)) exclude.push(i);
      }
      if (exclude.length === 0) continue;

      const score = scorePigeonDemo(exclude.length, k);
      if (score > bestScore) {
        bestScore = score;
        best = {
          axis,
          regionIds: [...combo],
          excludeCells: exclude,
          focusCells: focus,
        };
      }
    }
    return best;
  };

  return tryAxis('col') ?? tryAxis('row');
}

/** k regions occupying exactly k lines → exclude foreign cells on those lines. */
function findPigeonExclude(
  level: LevelDefinition,
  k: number,
  technique: TechniqueId,
): CoachStep | null {
  const demo = findBestPigeonExclude(level, k);
  if (!demo) return null;
  return {
    technique,
    action: 'EXCLUDE',
    focusCells: demo.focusCells,
    targetCells: capTargets(demo.excludeCells),
    regionId: demo.regionIds[0],
    regionIds: demo.regionIds,
    axis: demo.axis,
    messageKey: pigeonMessageKey(technique, demo.axis),
  };
}

function focusAroundCell(level: LevelDefinition, index: number): number[] {
  const size = level.size;
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const region = level.regions[index]!;
  const focus: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (
      rowOf(i, size) === r ||
      colOf(i, size) === c ||
      level.regions[i] === region
    ) {
      focus.push(i);
    }
  }
  return focus;
}

function pigeonMessageKey(technique: TechniqueId, axis: 'row' | 'col'): string {
  if (technique === 'T3') return axis === 'row' ? 'coach.T2_row' : 'coach.T2_col';
  if (technique === 'T2') return axis === 'row' ? 'coach.T1_row' : 'coach.T1_col';
  return axis === 'row' ? 'coach.T2_row' : 'coach.T2_col';
}

function findPlaceCatStep(level: LevelDefinition, technique: TechniqueId): CoachStep | null {
  const target = firstForcedPlacement(level);
  if (target == null) return null;
  const messageKey = technique === 'T4' ? 'coach.T6_place' : 'coach.T3_place';
  return {
    technique,
    action: 'PLACE_CAT',
    focusCells: focusAroundCell(level, target),
    targetCells: [target],
    regionId: level.regions[target],
    messageKey,
  };
}

/**
 * Place a forced cat, then exclude the cascade band (“三重排除” / 连锁清空).
 */
function findCascadeLesson(level: LevelDefinition, technique: TechniqueId = 'T1'): CoachStep[] {
  const place = findPlaceCatStep(level, technique);
  if (!place) return [];
  const cat = place.targetCells[0]!;
  const size = level.size;
  const r = rowOf(cat, size);
  const c = colOf(cat, size);
  const region = level.regions[cat]!;
  const cascade = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (i === cat) continue;
    if (
      rowOf(i, size) === r ||
      colOf(i, size) === c ||
      level.regions[i] === region ||
      neighborIndexes(cat, size).includes(i)
    ) {
      cascade.add(i);
    }
  }
  const targets = capTargets([...cascade]);
  if (targets.length < 2) return [place];
  const excludeStep: CoachStep = {
    technique,
    action: 'EXCLUDE',
    focusCells: [...new Set([...place.focusCells, ...targets])],
    targetCells: targets,
    regionId: region,
    messageKey: 'coach.T3_cascade',
  };
  return [place, excludeStep];
}

/** Size-2 region: exclude the non-solution cell (and prefer a line with extras). */
function findDualCellExclude(level: LevelDefinition): CoachStep | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  const solution = new Set(level.solution ?? []);
  let best: CoachStep | null = null;
  let bestScore = -1;

  for (let rid = 0; rid < size; rid++) {
    const cells = buckets[rid]!;
    if (cells.length !== 2) continue;
    const [a, b] = cells;
    if (a == null || b == null) continue;
    const sameRow = rowOf(a, size) === rowOf(b, size);
    const sameCol = colOf(a, size) === colOf(b, size);
    if (!sameRow && !sameCol) continue;

    const wrong = cells.find((i) => !solution.has(i));
    if (wrong == null) continue;

    const axis: 'row' | 'col' = sameRow ? 'row' : 'col';
    const line = sameRow ? rowOf(a, size) : colOf(a, size);
    const focus: number[] = [];
    const extras: number[] = [];
    for (let i = 0; i < size * size; i++) {
      const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
      if (onLine || level.regions[i] === rid) focus.push(i);
      if (onLine && level.regions[i] !== rid && i !== wrong) extras.push(i);
    }
    // Exclude the wrong dual cell first; if the line also has foreign cells, clear a few.
    const targets = capTargets([wrong, ...extras]);
    const step: CoachStep = {
      technique: 'T3',
      action: 'EXCLUDE',
      focusCells: focus,
      targetCells: targets,
      regionId: rid,
      axis,
      messageKey: 'coach.T5',
    };
    const score = targets.length * 40 + (extras.length > 0 ? 30 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best ?? findPigeonExclude(level, 2, 'T3');
}

/**
 * T6: exclude a non-solution cell from a size-2 region (the side that fails a what-if).
 */
function findWhatIfExclude(level: LevelDefinition): CoachStep | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  const solution = new Set(level.solution ?? []);
  let best: CoachStep | null = null;
  let bestScore = -1;

  for (let rid = 0; rid < size; rid++) {
    const cells = buckets[rid]!;
    if (cells.length < 2 || cells.length > 3) continue;
    const wrongs = cells.filter((i) => !solution.has(i));
    if (wrongs.length === 0) continue;
    const sameRow = cells.every((i) => rowOf(i, size) === rowOf(cells[0]!, size));
    const sameCol = cells.every((i) => colOf(i, size) === colOf(cells[0]!, size));
    const axis: 'row' | 'col' | undefined = sameRow ? 'row' : sameCol ? 'col' : undefined;
    const focus = new Set<number>(cells);
    if (axis) {
      const line = axis === 'row' ? rowOf(cells[0]!, size) : colOf(cells[0]!, size);
      for (let i = 0; i < size * size; i++) {
        const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
        if (onLine) focus.add(i);
      }
    }
    const targets = capTargets(wrongs);
    const step: CoachStep = {
      technique: 'T4',
      action: 'EXCLUDE',
      focusCells: [...focus],
      targetCells: targets,
      regionId: rid,
      axis,
      messageKey: 'coach.T6_exclude',
    };
    const score = targets.length * 50 + (axis ? 20 : 0) + (cells.length === 2 ? 30 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best ?? findPigeonExclude(level, 2, 'T4');
}

/** Solution cats whose region is a single cell (instant “must place”). */
export function singletonSolutionCats(level: LevelDefinition): number[] {
  const buckets = regionBuckets(level);
  const solution = new Set(level.solution ?? []);
  const out: number[] = [];
  for (let rid = 0; rid < level.size; rid++) {
    const cells = buckets[rid]!;
    if (cells.length !== 1) continue;
    const cell = cells[0]!;
    if (solution.has(cell)) out.push(cell);
  }
  return out.sort((a, b) => a - b);
}

function rowColExcludeTargets(level: LevelDefinition, cat: number): number[] {
  const size = level.size;
  const r = rowOf(cat, size);
  const c = colOf(cat, size);
  const out: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (i === cat) continue;
    if (rowOf(i, size) === r || colOf(i, size) === c) out.push(i);
  }
  return out;
}

function rowColFocus(level: LevelDefinition, cat: number): number[] {
  const size = level.size;
  const r = rowOf(cat, size);
  const c = colOf(cat, size);
  const focus: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (rowOf(i, size) === r || colOf(i, size) === c) focus.push(i);
  }
  return focus;
}

/** L1: double-tap first singleton cat → exclude its row & column. */
function findL1Lesson(level: LevelDefinition): CoachStep[] {
  const singles = singletonSolutionCats(level);
  const cat = singles[0];
  if (cat == null) return [];
  const place: CoachStep = {
    technique: 'T0',
    action: 'PLACE_CAT',
    focusCells: focusAroundCell(level, cat),
    targetCells: [cat],
    regionId: level.regions[cat],
    messageKey: 'coach.L1_place',
  };
  const targets = rowColExcludeTargets(level, cat);
  const exclude: CoachStep = {
    technique: 'T0',
    action: 'EXCLUDE',
    focusCells: rowColFocus(level, cat),
    targetCells: targets,
    regionId: level.regions[cat],
    messageKey: 'coach.L1_rowcol',
  };
  return targets.length ? [place, exclude] : [place];
}

/**
 * L3: first singleton cat is already shown; swipe-exclude its 8-neighbors.
 * `prePlaceCats` tells the UI which cell to seed before the gesture.
 */
export function findL3Lesson(level: LevelDefinition): {
  steps: CoachStep[];
  prePlaceCats: number[];
} {
  const singles = singletonSolutionCats(level);
  const cat = singles[0];
  if (cat == null) return { steps: [], prePlaceCats: [] };
  const neighbors = neighborIndexes(cat, level.size);
  if (neighbors.length === 0) return { steps: [], prePlaceCats: [] };
  const step: CoachStep = {
    technique: 'T0',
    action: 'EXCLUDE',
    focusCells: [cat, ...neighbors],
    targetCells: neighbors,
    regionId: level.regions[cat],
    messageKey: 'coach.L3_adj',
  };
  return { steps: [step], prePlaceCats: [cat] };
}

export interface LevelCoachPlan {
  /** Save key (T0 / T1a / T1b / T2…). */
  guideKey: string;
  steps: CoachStep[];
  /** Cats to place on an empty board before coaching (T1b). */
  prePlaceCats: number[];
}

function guideKeyToTechnique(key: GuideKey): TechniqueId {
  if (key === 'T1a' || key === 'T1b') return 'T1';
  return key;
}

/**
 * Build interactive coach from level.hint when guide:true.
 * Falls back to legacy demo helpers when hint is absent.
 */
export function findLevelCoachPlan(level: LevelDefinition): LevelCoachPlan | null {
  const guideKey = coachGuideKeyForLevel(level.id);
  if (!guideKey) return null;

  if (level.guide && level.hint) {
    const hint = level.hint;
    const technique = guideKeyToTechnique(guideKey);
    const focus = [
      ...new Set([...(hint.highlightCells ?? []), ...(hint.crossOutCells ?? [])]),
    ].sort((a, b) => a - b);
    const regionIds = (hint.highlightRegions ?? []).slice();
    const steps: CoachStep[] = [];

    if (hint.crossOutCells && hint.crossOutCells.length > 0) {
      steps.push({
        technique,
        action: 'EXCLUDE',
        focusCells: focus.length ? focus : hint.crossOutCells.slice(),
        targetCells: hint.crossOutCells.slice(),
        regionId: regionIds[0],
        regionIds: regionIds.length ? regionIds : undefined,
        messageKey: `coach.${guideKey}`,
        messageText: hint.text,
      });
    } else {
      const cell =
        hint.pointerCell ??
        (hint.highlightCells && hint.highlightCells.length > 0 ? hint.highlightCells[0]! : null);
      if (cell == null) return null;
      steps.push({
        technique,
        action: 'PLACE_CAT',
        focusCells: hint.highlightCells?.length ? hint.highlightCells.slice() : [cell],
        targetCells: [cell],
        regionId: regionIds[0] ?? level.regions[cell],
        regionIds: regionIds.length ? regionIds : undefined,
        messageKey: `coach.${guideKey}`,
        messageText: hint.text,
      });
    }

    return {
      guideKey,
      steps,
      prePlaceCats: level.prePlaceCats?.slice() ?? [],
    };
  }

  // Legacy fallback for packs without embedded hints.
  const tech = techniqueGuideFallback(guideKey);
  if (!tech) return null;
  const steps = findCoachLesson(level, tech);
  if (!steps.length) return null;
  const pre =
    guideKey === 'T1a' || guideKey === 'T1b'
      ? level.prePlaceCats?.slice() ??
        (guideKey === 'T1b' ? findL3Lesson(level).prePlaceCats : singletonSolutionCats(level).slice(0, 1))
      : [];
  return { guideKey, steps, prePlaceCats: pre };
}

function techniqueGuideFallback(key: GuideKey): TechniqueId | null {
  if (key === 'T0') return 'T0';
  if (key === 'T1a' || key === 'T1b') return 'T1';
  if (key === 'T2' || key === 'T3' || key === 'T4') return key;
  return null;
}

/**
 * Build the interactive coach step for a teach level.
 * Returns null when the board has no clear demo structure.
 */
export function findCoachStep(
  level: LevelDefinition,
  technique: TechniqueId,
): CoachStep | null {
  const lesson = findCoachLesson(level, technique);
  return lesson[0] ?? null;
}

/** Demo helpers retained for tooling; UI coaches are off. */
export function findCoachLesson(
  level: LevelDefinition,
  technique: TechniqueId,
): CoachStep[] {
  switch (technique) {
    case 'T0':
      return [];
    case 'T1':
      // 三重排除 ≈ 放猫后的连锁清空演示
      return findCascadeLesson(level, 'T1');
    case 'T2': {
      // 区域锁定
      const s = findLinePinExclude(level);
      return s ? [s] : [];
    }
    case 'T3': {
      // 鸽巢锁定
      const s = findPigeonExclude(level, 2, 'T3') ?? findLinePinExclude(level);
      return s ? [s] : [];
    }
    case 'T4': {
      // 假设回溯
      const s = findWhatIfExclude(level) ?? findPlaceCatStep(level, 'T4');
      return s ? [s] : [];
    }
    default:
      return [];
  }
}

/**
 * How “satisfying” a teach demo feels — used by the generator quality gate.
 * Higher is better; teach levels should clear several cells or place+cascade.
 */
export function scoreCoachLesson(steps: CoachStep[]): number {
  if (steps.length === 0) return 0;
  let score = 0;
  for (const s of steps) {
    if (s.action === 'EXCLUDE') score += s.targetCells.length * 40;
    if (s.action === 'PLACE_CAT') score += 50;
  }
  if (steps.length >= 2) score += 60;
  return score;
}

/** Minimum score for a teach board to feel “上手就好用” (unused while coaches off). */
export function teachCoachMinScore(technique: TechniqueId): number {
  switch (technique) {
    case 'T1':
      return 90;
    case 'T2':
      return 80;
    case 'T3':
      return 80;
    case 'T4':
      return 40;
    default:
      return 40;
  }
}

/** Next unfinished target for the hand pointer (stable ascending order). */
export function nextCoachPointer(targets: Iterable<number>, done: Set<number>): number {
  const pending = [...targets].filter((i) => !done.has(i)).sort((a, b) => a - b);
  return pending[0] ?? -1;
}
