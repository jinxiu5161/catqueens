import { neighborIndexes } from '../puzzle/PuzzleRules';
import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';

/** Human-facing difficulty tiers (Chinese). */
export type DifficultyTier = '入门' | '简单' | '普通' | '进阶' | '困难' | '专家';

export interface DifficultyRating {
  /** 1–10 star-style rating for UI. */
  stars: number;
  tier: DifficultyTier;
  /** True if solvable by forced moves only (no branching / guessing). */
  noGuess: boolean;
  /** How many forced placement steps the deterministic solver needed (0 if unsolved). */
  forcedSteps: number;
}

/**
 * Candidate cell is legal if not blocked and does not conflict with placed cats
 * (row / col / region / 8-adjacency).
 */
function isCandidate(
  level: LevelDefinition,
  blocked: boolean[],
  cats: number[],
  catSet: Set<number>,
  index: number,
): boolean {
  if (blocked[index]) return false;
  if (catSet.has(index)) return false;
  const size = level.size;
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const region = level.regions[index]!;
  for (const cat of cats) {
    if (rowOf(cat, size) === r) return false;
    if (colOf(cat, size) === c) return false;
    if (level.regions[cat] === region) return false;
    if (neighborIndexes(cat, size).includes(index)) return false;
  }
  return true;
}

function listCandidates(
  level: LevelDefinition,
  blocked: boolean[],
  cats: number[],
  catSet: Set<number>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < level.size * level.size; i++) {
    if (isCandidate(level, blocked, cats, catSet, i)) out.push(i);
  }
  return out;
}

/**
 * Find cells forced by singleton row / column / region logic (新手可做的推理).
 */
function findForced(
  level: LevelDefinition,
  blocked: boolean[],
  cats: number[],
  catSet: Set<number>,
): number[] {
  const size = level.size;
  const cands = listCandidates(level, blocked, cats, catSet);
  const forced = new Set<number>();

  const rowHas = Array.from({ length: size }, () => false);
  const colHas = Array.from({ length: size }, () => false);
  const regionHas = new Map<number, boolean>();
  for (const cat of cats) {
    rowHas[rowOf(cat, size)] = true;
    colHas[colOf(cat, size)] = true;
    regionHas.set(level.regions[cat]!, true);
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
    if (regionHas.get(rid)) continue;
    const cells = cands.filter((i) => level.regions[i] === rid);
    if (cells.length === 1) forced.add(cells[0]!);
  }

  return [...forced];
}

function placeCat(
  level: LevelDefinition,
  blocked: boolean[],
  cats: number[],
  catSet: Set<number>,
  index: number,
): void {
  const size = level.size;
  cats.push(index);
  catSet.add(index);
  blocked[index] = true;
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const region = level.regions[index]!;
  for (let i = 0; i < size * size; i++) {
    if (blocked[i]) continue;
    if (rowOf(i, size) === r || colOf(i, size) === c || level.regions[i] === region) {
      blocked[i] = true;
    }
  }
  for (const n of neighborIndexes(index, size)) blocked[n] = true;
}

/**
 * True when the unique solution can be reached by repeatedly placing
 * singleton-forced cats (row / col / region). No branching = 不需要猜想.
 */
export function isNoGuessLevel(level: LevelDefinition): { ok: boolean; steps: number } {
  const size = level.size;
  const blocked = Array.from({ length: size * size }, () => false);
  const cats: number[] = [];
  const catSet = new Set<number>();
  let steps = 0;
  let guard = size * size + 2;

  while (cats.length < size && guard-- > 0) {
    const forced = findForced(level, blocked, cats, catSet);
    if (forced.length === 0) {
      return { ok: false, steps };
    }
    // Place all currently forced (order stable for determinism)
    forced.sort((a, b) => a - b);
    for (const idx of forced) {
      if (catSet.has(idx) || blocked[idx]) continue;
      if (!isCandidate(level, blocked, cats, catSet, idx)) {
        return { ok: false, steps };
      }
      placeCat(level, blocked, cats, catSet, idx);
      steps += 1;
      if (cats.length >= size) break;
    }
  }

  if (cats.length !== size) return { ok: false, steps };
  const expected = [...(level.solution ?? [])].sort((a, b) => a - b);
  const got = [...cats].sort((a, b) => a - b);
  if (expected.length && JSON.stringify(expected) !== JSON.stringify(got)) {
    return { ok: false, steps };
  }
  return { ok: true, steps };
}

export function tierFromStars(stars: number): DifficultyTier {
  if (stars <= 2) return '入门';
  if (stars <= 3) return '简单';
  if (stars <= 5) return '普通';
  if (stars <= 6) return '进阶';
  if (stars <= 8) return '困难';
  return '专家';
}

/**
 * Rate a unique level for UI: stars 1–10 + Chinese tier.
 * Prefers no-guess + smaller boards for lower ratings.
 */
export function rateLevel(level: LevelDefinition): DifficultyRating {
  const noGuessInfo = isNoGuessLevel(level);
  const size = level.size;
  // Base from board size (4→1 … 10→7)
  let stars = Math.max(1, Math.min(7, size - 3));
  if (!noGuessInfo.ok) stars += 2;
  // Slight bump when many forced steps (longer puzzles)
  if (noGuessInfo.ok && noGuessInfo.steps >= size) {
    stars += Math.min(1, Math.floor(noGuessInfo.steps / (size + 2)));
  }
  // Fewer free singleton regions → slightly higher stars within same size
  const singles = countSingletonRegions(level);
  if (singles <= Math.floor(size / 4)) stars = Math.min(10, stars + 1);
  stars = Math.max(1, Math.min(10, stars));
  return {
    stars,
    tier: tierFromStars(stars),
    noGuess: noGuessInfo.ok,
    forcedSteps: noGuessInfo.steps,
  };
}

/** How many regions are size-1 (instant forced cats). */
export function countSingletonRegions(level: LevelDefinition): number {
  const counts = new Map<number, number>();
  for (const rid of level.regions) {
    counts.set(rid, (counts.get(rid) ?? 0) + 1);
  }
  let n = 0;
  for (const c of counts.values()) if (c === 1) n += 1;
  return n;
}

/**
 * Comparable hardness within the same board size.
 * Higher = harder. Driven mainly by fewer singleton regions.
 */
export function levelHardness(level: LevelDefinition): number {
  const singles = countSingletonRegions(level);
  const counts = new Map<number, number>();
  for (const rid of level.regions) {
    counts.set(rid, (counts.get(rid) ?? 0) + 1);
  }
  const sizes = [...counts.values()];
  const maxRegion = Math.max(...sizes);
  const noGuess = isNoGuessLevel(level);
  // Guessing levels are harder than no-guess at same singleton count
  const guessBoost = noGuess.ok ? 0 : 50_000;
  // Weight max-region lightly so progression is mostly singleton-driven
  // and equal-singleton levels stay feasible to generate.
  return (
    guessBoost +
    (level.size - singles) * 10_000 +
    maxRegion * 10 +
    noGuess.steps
  );
}
