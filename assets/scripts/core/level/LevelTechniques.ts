import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { countSingletonRegions, isNoGuessLevel } from './LevelDifficulty';

/**
 * Technique ids for the T0–T4 curriculum (level-gen v2).
 * T0 唯一候选 · T1 三重排除 · T2 区域锁定 · T3 鸽巢锁定 · T4 假设回溯
 */
export type TechniqueId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type GuideKey = 'T0' | 'T1a' | 'T1b' | 'T2' | 'T3' | 'T4';

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  T0: '唯一候选',
  T1: '三重排除',
  T2: '区域锁定',
  T3: '鸽巢锁定',
  T4: '假设回溯',
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
    const regionLines: number[] = [];
    for (let rid = 0; rid < size; rid++) {
      let mask = 0;
      for (const cell of buckets[rid]!) {
        const line = axis === 'row' ? rowOf(cell, size) : colOf(cell, size);
        mask |= 1 << line;
      }
      regionLines.push(mask);
    }
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
 * Preference order favors the highest structure present.
 */
export function inferPrimaryTechnique(level: LevelDefinition): TechniqueId {
  if (level.requiredTech === 4) return 'T4';
  if (level.requiredTech === 3) return 'T3';
  if (level.requiredTech === 2) return 'T2';
  if (level.requiredTech === 1) return 'T1';
  if (level.requiredTech === 0 && level.technique) return level.technique;
  const f = analyzeTechniques(level);
  if (!f.noGuess) return 'T4';
  if (f.hasPigeonhole3 || f.hasPigeonhole2) return 'T3';
  if (f.hasLinePin) return 'T2';
  if (f.hasSingleton) return 'T0';
  return 'T1';
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
  /** Spec stage label for stats. */
  stage?: string;
  guide?: boolean;
  guideKey?: GuideKey;
  pure?: boolean;
  /** Prefer min region area ≥3 (soft; id≥8). */
  preferMinRegionArea?: number;
}

/**
 * 500-level course (gen v2 / spec 3.1):
 * L1 T0 guide · L2 T1a guide · L3 T1 pure · L4 T1b guide · L5–7 T1 practice ·
 * L8–15 T2 · L16–50 T3 · L51–120 T4 · L121–250 mix · L251–400 mix · L401–500 T4
 */
export function curriculumFor(id: number): Lesson {
  // L1 — T0 唯一候选 guide
  if (id === 1) {
    return {
      technique: 'T0',
      size: 4,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 3,
      mode: 'teach',
      stage: '入门',
      guide: true,
      guideKey: 'T0',
    };
  }
  // L2 — T1a guide: prePlace a singleton, teach row/col exclude
  if (id === 2) {
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 2,
      mode: 'teach',
      stage: '入门',
      guide: true,
      guideKey: 'T1a',
    };
  }
  // L3 — T1 pure practice (5×5; size 4 cannot match L2 difficulty band)
  if (id === 3) {
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 2,
      mode: 'practice',
      stage: '入门',
      pure: true,
    };
  }
  // L4 — T1b adjacency guide (prePlaceCats)
  if (id === 4) {
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 2,
      mode: 'teach',
      stage: '入门',
      guide: true,
      guideKey: 'T1b',
    };
  }
  // L5–7 — T1 practice on 5×5 (L1 remains the sole 4×4 onboarding board)
  if (id <= 7) {
    return {
      technique: 'T1',
      size: 5,
      requireNoGuess: true,
      minSingles: 1,
      maxSingles: 2,
      mode: 'practice',
      stage: '入门',
      pure: true,
    };
  }
  // L8–15 — T2 区域锁定，5×5
  if (id <= 15) {
    const mode: Lesson['mode'] = id === 8 ? 'teach' : id <= 11 ? 'practice' : 'mixed';
    return {
      technique: 'T2',
      size: 5,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: id === 8 ? 0 : 1,
      requireLinePin: true,
      mode,
      stage: '基础',
      guide: id === 8,
      guideKey: id === 8 ? 'T2' : undefined,
      pure: id !== 8 && mode === 'practice',
      preferMinRegionArea: 3,
    };
  }
  // L16–50 — T3 鸽巢，5×5 / 6×6
  if (id <= 50) {
    const size = id <= 25 ? 5 : 6;
    const mode: Lesson['mode'] = id === 16 ? 'teach' : id <= 21 ? 'practice' : 'mixed';
    return {
      technique: 'T3',
      size,
      requireNoGuess: true,
      minSingles: 0,
      maxSingles: 1,
      requirePigeonhole: 2,
      mode,
      stage: '进阶',
      guide: id === 16,
      guideKey: id === 16 ? 'T3' : undefined,
      pure: id !== 16 && mode === 'practice',
      preferMinRegionArea: 3,
    };
  }
  // L51–120 — T4 假设回溯，6×6 / 7×7
  if (id <= 120) {
    const size = id <= 80 ? 6 : 7;
    const mode: Lesson['mode'] = id === 51 ? 'teach' : id <= 56 ? 'practice' : 'mixed';
    return {
      technique: 'T4',
      size,
      requireNoGuess: false,
      minSingles: 0,
      maxSingles: 2,
      mode,
      stage: '高级A',
      guide: id === 51,
      guideKey: id === 51 ? 'T4' : undefined,
      pure: id !== 51 && mode === 'practice',
      preferMinRegionArea: 3,
    };
  }
  // L121–250 — T2/T3/T4 混合，7×7 / 8×8
  // Large boards: noGuess+pin is too sparse; allow guess while keeping structure tags.
  if (id <= 250) {
    const size = id <= 180 ? 7 : 8;
    const slot = id % 3;
    const technique: TechniqueId = slot === 0 ? 'T2' : slot === 1 ? 'T3' : 'T4';
    return {
      technique,
      size,
      requireNoGuess: false,
      minSingles: 0,
      maxSingles: 2,
      requireLinePin: technique === 'T2',
      requirePigeonhole: technique === 'T3' ? 2 : undefined,
      mode: 'mixed',
      stage: '高级B',
      preferMinRegionArea: 3,
    };
  }
  // L251–400 — 跨技巧，8×8 / 9×9
  // 9×9 boards almost never hit exact requiredTech 2/3 uniquely; prefer T4 there.
  // 8×8 keeps a T2/T3/T4 mix with structure flags.
  if (id <= 400) {
    const size = id <= 320 ? 8 : 9;
    let technique: TechniqueId;
    if (size >= 9) {
      technique = 'T4';
    } else {
      const slot = id % 3;
      technique = slot === 0 ? 'T3' : slot === 1 ? 'T4' : 'T2';
    }
    return {
      technique,
      size,
      requireNoGuess: false,
      minSingles: 0,
      maxSingles: 2,
      requireLinePin: technique === 'T2',
      requirePigeonhole: technique === 'T3' ? 2 : undefined,
      mode: 'mixed',
      stage: '大师',
      preferMinRegionArea: 3,
    };
  }
  // L401–500 — 9×9 极限，偏 T4
  return {
    technique: 'T4',
    size: 9,
    requireNoGuess: false,
    minSingles: 0,
    maxSingles: 2,
    mode: 'mixed',
    stage: '终局',
    preferMinRegionArea: 3,
  };
}

/** Primary technique → first teach level id. */
export const TECHNIQUE_GUIDE_LEVEL: Partial<Record<TechniqueId, number>> = {
  T0: 1,
  T1: 2,
  T2: 8,
  T3: 16,
  T4: 51,
};

export function techniqueGuideForLevel(id: number): TechniqueId | null {
  for (const [tech, lid] of Object.entries(TECHNIQUE_GUIDE_LEVEL) as [TechniqueId, number][]) {
    if (lid === id) return tech;
  }
  return null;
}

/** Interactive coach save keys (includes T1a / T1b split). */
export function coachGuideKeyForLevel(id: number): GuideKey | null {
  switch (id) {
    case 1:
      return 'T0';
    case 2:
      return 'T1a';
    case 4:
      return 'T1b';
    case 8:
      return 'T2';
    case 16:
      return 'T3';
    case 51:
      return 'T4';
    default:
      return null;
  }
}
