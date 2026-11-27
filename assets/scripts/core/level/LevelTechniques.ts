import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { countSingletonRegions, isNoGuessLevel } from './LevelDifficulty';

/** Curriculum techniques T0–T6 (see level generator docs). */
export type TechniqueId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  T0: '单格必放',
  T1: '色区锁行/列',
  T2: '双区鸽巢',
  T3: '放猫连锁',
  T4: '三区鸽巢',
  T5: '双格互锁',
  T6: '假设试推',
};

export interface TechniqueFlags {
  hasSingleton: boolean;
  singletonCount: number;
  /** Region size≥2 fully inside one row or one column. */
  hasLinePin: boolean;
  /** Exists k regions whose cells lie in some k columns (or k rows). */
  hasPigeonhole2: boolean;
  hasPigeonhole3: boolean;
  size2RegionCount: number;
  noGuess: boolean;
  forcedSteps: number;
}

function regionCells(level: LevelDefinition): number[][] {
  const buckets: number[][] = Array.from({ length: level.size }, () => []);
  for (let i = 0; i < level.regions.length; i++) {
    buckets[level.regions[i]!]!.push(i);
  }
  return buckets;
}

function isLinePinned(cells: number[], size: number): boolean {
  if (cells.length < 2) return false;
  const r0 = rowOf(cells[0]!, size);
  const c0 = colOf(cells[0]!, size);
  return cells.every((i) => rowOf(i, size) === r0) || cells.every((i) => colOf(i, size) === c0);
}

/** True if some set of exactly k regions is contained in some k lines (rows or cols). */
export function hasPigeonhole(level: LevelDefinition, k: number): boolean {
  if (k < 2 || level.size < k) return false;
  const buckets = regionCells(level);
  const size = level.size;

  const checkAxis = (axis: 'row' | 'col'): boolean => {
    // For each region, bitset of lines it occupies
    const regionLines: number[] = [];
    for (let rid = 0; rid < size; rid++) {
      let mask = 0;
      for (const cell of buckets[rid]!) {
        const line = axis === 'row' ? rowOf(cell, size) : colOf(cell, size);
        mask |= 1 << line;
      }
      regionLines.push(mask);
    }
    // Enumerate combinations of k regions (n<=10 → C(10,3)=120 ok)
    const ids = Array.from({ length: size }, (_, i) => i);
    const combos = (arr: number[], n: number): number[][] => {
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
    };
    for (const combo of combos(ids, k)) {
      let union = 0;
      for (const rid of combo) union |= regionLines[rid]!;
      // popcount
      let bits = 0;
      for (let t = union; t; t >>= 1) bits += t & 1;
      if (bits === k) return true;
    }
    return false;
  };

  return checkAxis('col') || checkAxis('row');
}

export function analyzeTechniques(level: LevelDefinition): TechniqueFlags {
  const buckets = regionCells(level);
  const size = level.size;
  let hasLinePin = false;
  let size2 = 0;
  for (const cells of buckets) {
    if (cells.length === 2) size2 += 1;
    if (isLinePinned(cells, size)) hasLinePin = true;
  }
  const singles = countSingletonRegions(level);
  const ng = isNoGuessLevel(level);
  return {
    hasSingleton: singles > 0,
    singletonCount: singles,
    hasLinePin,
    hasPigeonhole2: hasPigeonhole(level, 2),
    hasPigeonhole3: hasPigeonhole(level, 3),
    size2RegionCount: size2,
    noGuess: ng.ok,
    forcedSteps: ng.steps,
  };
}

/**
 * Best primary technique tag for UI / curriculum labeling.
 * Preference order favors the "highest" structure present.
 */
export function inferPrimaryTechnique(level: LevelDefinition): TechniqueId {
  const f = analyzeTechniques(level);
  if (!f.noGuess) return 'T6';
  if (f.hasPigeonhole3) return 'T4';
  if (f.size2RegionCount >= 2 && f.singletonCount === 0 && f.hasPigeonhole2) return 'T5';
  if (f.hasPigeonhole2) return 'T2';
  if (f.hasLinePin) return 'T1';
  if (f.hasSingleton) return 'T0';
  return 'T3';
}

export interface Lesson {
  technique: TechniqueId;
  size: number;
  requireNoGuess: boolean;
  minSingles: number;
  maxSingles: number;
  requireLinePin?: boolean;
  requirePigeonhole?: 2 | 3;
  preferDualPairs?: boolean;
  mode: 'teach' | 'practice' | 'mixed';
}

/** Technique course for 500 levels — size may dip when teaching a new skill. */
export function curriculumFor(id: number): Lesson {
  if (id <= 2) {
    return {
      technique: 'T0',
      size: 4,
      requireNoGuess: true,
      minSingles: 2,
      maxSingles: 3,
      mode: 'teach',
    };
  }
  if (id <= 4) {
    return {
      technique: 'T0',
      size: 4,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 2,
      mode: 'practice',
    };
  }
  if (id === 5) {
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      requireLinePin: true,
      mode: 'teach',
    };
  }
  if (id <= 14) {
    // Stay on 5×5 for all T1 practice (no awkward dip back to 4×4)
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      requireLinePin: true,
      mode: 'practice',
    };
  }
  if (id === 15) {
    return {
      technique: 'T3',
      size: 5,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      mode: 'teach',
    };
  }
  if (id <= 20) {
    return {
      technique: 'T3',
      size: 5,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      mode: 'practice',
    };
  }
  if (id <= 28) {
    return {
      technique: 'T3',
      size: 6,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      mode: 'practice',
    };
  }
  if (id <= 32) {
    return {
      technique: 'T2',
      size: 6,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      requirePigeonhole: 2,
      mode: 'teach',
    };
  }
  if (id <= 50) {
    const size = id % 4 === 0 ? 5 : 6;
    return {
      technique: 'T2',
      size,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      requirePigeonhole: 2,
      mode: 'practice',
    };
  }
  if (id <= 58) {
    return {
      technique: 'T4',
      size: 6,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 2,
      // Prefer k=3 builders; matcher accepts k=2 / line-pin backbone
      requirePigeonhole: 2,
      mode: 'teach',
    };
  }
  if (id <= 100) {
    // Stay on 6×6 for T4 practice — 7×7+noGuess without many freebies is too sparse
    return {
      technique: 'T4',
      size: 6,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 2,
      requirePigeonhole: 2,
      mode: 'practice',
    };
  }
  if (id <= 120) {
    return {
      technique: 'T5',
      size: 7,
      requireNoGuess: false,
      minSingles: 1,
      maxSingles: 3,
      preferDualPairs: true,
      mode: 'teach',
    };
  }
  if (id <= 200) {
    const size = id < 160 ? 7 : 8;
    return {
      technique: 'T5',
      size,
      requireNoGuess: false,
      minSingles: 1,
      maxSingles: 3,
      preferDualPairs: true,
      mode: 'practice',
    };
  }
  if (id <= 260) {
    return {
      technique: 'T3',
      size: 8,
      requireNoGuess: false,
      minSingles: 2,
      maxSingles: 3,
      mode: 'mixed',
    };
  }
  if (id <= 340) {
    return {
      technique: 'T6',
      size: 8,
      requireNoGuess: false,
      minSingles: 0,
      maxSingles: 1,
      mode: 'teach',
    };
  }
  if (id <= 420) {
    return {
      technique: 'T6',
      size: 9,
      requireNoGuess: false,
      minSingles: 0,
      maxSingles: 2,
      mode: 'practice',
    };
  }
  return {
    technique: 'T6',
    size: 10,
    requireNoGuess: false,
    minSingles: 1,
    maxSingles: 3,
    mode: 'practice',
  };
}

/**
 * First level that introduces each technique (interactive board coach).
 * T0 uses tutorial.1 / tutorial.2 instead.
 */
export const TECHNIQUE_GUIDE_LEVEL: Partial<Record<TechniqueId, number>> = {
  T1: 5,
  T3: 15,
  T2: 29,
  T4: 51,
  T5: 101,
  T6: 261,
};

export function techniqueGuideForLevel(id: number): TechniqueId | null {
  for (const [tech, levelId] of Object.entries(TECHNIQUE_GUIDE_LEVEL) as Array<
    [TechniqueId, number]
  >) {
    if (levelId === id) return tech;
  }
  return null;
}
