import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { neighborIndexes } from '../puzzle/PuzzleRules';
import { firstForcedPlacement } from './LevelDifficulty';
import {
  coachGuideKeyForLevel,
  techniqueGuideForLevel,
  type TechniqueId,
} from './LevelTechniques';

/** Player must exclude or place a cat on the guided cells. */
export type CoachAction = 'EXCLUDE' | 'PLACE_CAT';

/**
 * One interactive board step: spotlight focus cells, require action on targets.
 * `messageKey` may contain `{region}` for an inline color chip.
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

/** Region fully contained in one row or one column (size ≥ 2). */
function findLinePinExclude(level: LevelDefinition): CoachStep | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  let best: CoachStep | null = null;
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

    const step: CoachStep = {
      technique: 'T1',
      action: 'EXCLUDE',
      focusCells: focus,
      targetCells: capTargets(exclude),
      regionId: rid,
      axis,
      messageKey: axis === 'row' ? 'coach.T1_row' : 'coach.T1_col',
    };
    const score = scoreLinePinDemo(exclude.length, cells.length);
    if (score > bestScore) {
      bestScore = score;
      best = step;
    }
  }
  return best;
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
  if (technique === 'T4') return axis === 'row' ? 'coach.T4_row' : 'coach.T4_col';
  if (technique === 'T5') return 'coach.T5';
  if (technique === 'T6') return 'coach.T6_exclude';
  return axis === 'row' ? 'coach.T2_row' : 'coach.T2_col';
}

function findPlaceCatStep(level: LevelDefinition, technique: TechniqueId): CoachStep | null {
  const target = firstForcedPlacement(level);
  if (target == null) return null;
  const messageKey =
    technique === 'T6' ? 'coach.T6_place' : technique === 'T5' ? 'coach.T5' : 'coach.T3_place';
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
 * T3 teach: place a forced cat, then exclude the cascade band so the player
 * feels the “放一只，叉一片” payoff.
 */
function findT3Lesson(level: LevelDefinition): CoachStep[] {
  const place = findPlaceCatStep(level, 'T3');
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
    technique: 'T3',
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
      technique: 'T5',
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
  return best ?? findPigeonExclude(level, 2, 'T5');
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
      technique: 'T6',
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
  return best ?? findPigeonExclude(level, 2, 'T6');
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
  /** Save key (L1 / L3 / T1…). */
  guideKey: string;
  steps: CoachStep[];
  /** Cats to place on an empty board before coaching (L3). */
  prePlaceCats: number[];
}

/** Level-aware coach plan (early onboarding + T1–T6 teach). */
export function findLevelCoachPlan(level: LevelDefinition): LevelCoachPlan | null {
  const guideKey = coachGuideKeyForLevel(level.id);
  if (!guideKey) return null;
  if (level.id === 1) {
    const steps = findL1Lesson(level);
    return steps.length ? { guideKey, steps, prePlaceCats: [] } : null;
  }
  if (level.id === 3) {
    const { steps, prePlaceCats } = findL3Lesson(level);
    return steps.length ? { guideKey, steps, prePlaceCats } : null;
  }
  const tech = techniqueGuideForLevel(level.id);
  if (!tech) return null;
  const steps = findCoachLesson(level, tech);
  return steps.length ? { guideKey, steps, prePlaceCats: [] } : null;
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

/** Full coach script (T3 may be place → cascade exclude). */
export function findCoachLesson(
  level: LevelDefinition,
  technique: TechniqueId,
): CoachStep[] {
  switch (technique) {
    case 'T0':
      if (level.id === 1) return findL1Lesson(level);
      if (level.id === 3) return findL3Lesson(level).steps;
      return [];
    case 'T1': {
      const s = findLinePinExclude(level);
      return s ? [s] : [];
    }
    case 'T2': {
      const s = findPigeonExclude(level, 2, 'T2') ?? findLinePinExclude(level);
      return s ? [s] : [];
    }
    case 'T3':
      return findT3Lesson(level);
    case 'T4': {
      const s =
        findPigeonExclude(level, 3, 'T4') ??
        findPigeonExclude(level, 2, 'T4') ??
        findLinePinExclude(level);
      return s ? [s] : [];
    }
    case 'T5': {
      const s = findDualCellExclude(level) ?? findPlaceCatStep(level, 'T5');
      return s ? [s] : [];
    }
    case 'T6': {
      const s = findWhatIfExclude(level) ?? findPlaceCatStep(level, 'T6');
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

/** Minimum score for a teach board to feel “上手就好用”. */
export function teachCoachMinScore(technique: TechniqueId): number {
  switch (technique) {
    case 'T1':
      return 80; // ≥2 excludes
    case 'T2':
      return 80;
    case 'T3':
      return 90; // place (+ cascade when available)
    case 'T4':
      return 80;
    case 'T5':
      return 80;
    case 'T6':
      return 40; // at least one solid what-if exclude
    default:
      return 40;
  }
}

/** Next unfinished target for the hand pointer (stable ascending order). */
export function nextCoachPointer(targets: Iterable<number>, done: Set<number>): number {
  const pending = [...targets].filter((i) => !done.has(i)).sort((a, b) => a - b);
  return pending[0] ?? -1;
}
