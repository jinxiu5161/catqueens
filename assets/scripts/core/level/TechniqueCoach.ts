import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { firstForcedPlacement } from './LevelDifficulty';
import type { TechniqueId } from './LevelTechniques';

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
  regionId?: number;
  axis?: 'row' | 'col';
  messageKey: string;
}

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

/** Region fully contained in one row or one column (size ≥ 2). */
function findLinePinExclude(level: LevelDefinition): CoachStep | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  let best: CoachStep | null = null;

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
    const focus = new Set<number>(cells);
    for (let i = 0; i < size * size; i++) {
      const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
      if (!onLine) continue;
      focus.add(i);
      if (level.regions[i] !== rid) exclude.push(i);
    }
    if (exclude.length === 0) continue;

    const step: CoachStep = {
      technique: 'T1',
      action: 'EXCLUDE',
      focusCells: [...focus],
      targetCells: exclude,
      regionId: rid,
      axis,
      messageKey: axis === 'row' ? 'coach.T1_row' : 'coach.T1_col',
    };
    if (!best || step.targetCells.length < best.targetCells.length) best = step;
  }
  return best;
}

/** k regions occupying exactly k lines → exclude foreign cells on those lines. */
function findPigeonExclude(
  level: LevelDefinition,
  k: number,
  technique: TechniqueId,
): CoachStep | null {
  if (k < 2 || level.size < k) return null;
  const size = level.size;
  const buckets = regionBuckets(level);
  const ids = Array.from({ length: size }, (_, i) => i);

  const tryAxis = (axis: 'row' | 'col'): CoachStep | null => {
    const regionLines: number[] = [];
    for (let rid = 0; rid < size; rid++) {
      let mask = 0;
      for (const cell of buckets[rid]!) {
        const line = axis === 'row' ? rowOf(cell, size) : colOf(cell, size);
        mask |= 1 << line;
      }
      regionLines.push(mask);
    }

    let best: CoachStep | null = null;
    for (const combo of combos(ids, k)) {
      let union = 0;
      for (const rid of combo) union |= regionLines[rid]!;
      if (popcount(union) !== k) continue;

      const lines: number[] = [];
      for (let i = 0; i < size; i++) if (union & (1 << i)) lines.push(i);
      const regionSet = new Set(combo);
      const exclude: number[] = [];
      const focus = new Set<number>();
      for (const rid of combo) for (const c of buckets[rid]!) focus.add(c);

      for (let i = 0; i < size * size; i++) {
        const line = axis === 'row' ? rowOf(i, size) : colOf(i, size);
        if (!lines.includes(line)) continue;
        focus.add(i);
        if (!regionSet.has(level.regions[i]!)) exclude.push(i);
      }
      if (exclude.length === 0) continue;

      const step: CoachStep = {
        technique,
        action: 'EXCLUDE',
        focusCells: [...focus],
        targetCells: exclude.slice(0, Math.min(exclude.length, 4)),
        regionId: combo[0],
        axis,
        messageKey: pigeonMessageKey(technique, axis),
      };
      // Prefer fewer targets so the forced gesture stays short
      if (!best || step.targetCells.length < best.targetCells.length) best = step;
    }
    return best;
  };

  return tryAxis('col') ?? tryAxis('row');
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
  const target =
    firstForcedPlacement(level) ??
    (level.solution && level.solution.length > 0 ? level.solution[0]! : null);
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

/** Size-2 region: exclude a non-solution cell on the same line if possible. */
function findDualCellExclude(level: LevelDefinition): CoachStep | null {
  const size = level.size;
  const buckets = regionBuckets(level);
  const solution = new Set(level.solution ?? []);

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
    for (let i = 0; i < size * size; i++) {
      const onLine = axis === 'row' ? rowOf(i, size) === line : colOf(i, size) === line;
      if (onLine || level.regions[i] === rid) focus.push(i);
    }
    return {
      technique: 'T5',
      action: 'EXCLUDE',
      focusCells: focus,
      targetCells: [wrong],
      regionId: rid,
      axis,
      messageKey: 'coach.T5',
    };
  }
  return findPigeonExclude(level, 2, 'T5');
}

/**
 * Build the interactive coach step for a teach level.
 * Returns null when the board has no clear demo structure.
 */
export function findCoachStep(
  level: LevelDefinition,
  technique: TechniqueId,
): CoachStep | null {
  switch (technique) {
    case 'T1':
      return findLinePinExclude(level);
    case 'T2':
      return findPigeonExclude(level, 2, 'T2') ?? findLinePinExclude(level);
    case 'T3':
      return findPlaceCatStep(level, 'T3');
    case 'T4':
      return (
        findPigeonExclude(level, 3, 'T4') ??
        findPigeonExclude(level, 2, 'T4') ??
        findLinePinExclude(level)
      );
    case 'T5':
      return findDualCellExclude(level) ?? findPlaceCatStep(level, 'T5');
    case 'T6':
      return findPlaceCatStep(level, 'T6') ?? findPigeonExclude(level, 2, 'T6');
    default:
      return null;
  }
}

/** Next unfinished target for the hand pointer (stable ascending order). */
export function nextCoachPointer(targets: Iterable<number>, done: Set<number>): number {
  const pending = [...targets].filter((i) => !done.has(i)).sort((a, b) => a - b);
  return pending[0] ?? -1;
}
