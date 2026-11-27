import { neighborIndexes } from '../puzzle/PuzzleRules';
import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { firstForcedPlacement } from './LevelDifficulty';
import { findBestPigeonExclude, singletonSolutionCats } from './TechniqueCoach';

/**
 * Beginner “open” cells: not a cat and not an exclude-note.
 * Early teaching treats exclude marks as what shrinks a row / col / region —
 * players are not assumed to mentally grey-out rule conflicts until marked.
 */
function openCells(
  level: LevelDefinition,
  cats: ReadonlySet<number>,
  excluded: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < level.size * level.size; i++) {
    if (cats.has(i) || excluded.has(i)) continue;
    out.push(i);
  }
  return out;
}

function isLegalVsCats(level: LevelDefinition, cats: number[], index: number): boolean {
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

/**
 * Forced placements a beginner can spot: a row / col / region with exactly one
 * remaining open (non-excluded) cell, and that cell is legal vs placed cats.
 */
export function beginnerForcedCats(
  level: LevelDefinition,
  cats: number[],
  excluded: ReadonlySet<number>,
): number[] {
  const size = level.size;
  const catSet = new Set(cats);
  const open = openCells(level, catSet, excluded);
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
    const cells = open.filter((i) => rowOf(i, size) === r);
    if (cells.length === 1 && isLegalVsCats(level, cats, cells[0]!)) forced.add(cells[0]!);
  }
  for (let c = 0; c < size; c++) {
    if (colHas[c]) continue;
    const cells = open.filter((i) => colOf(i, size) === c);
    if (cells.length === 1 && isLegalVsCats(level, cats, cells[0]!)) forced.add(cells[0]!);
  }
  for (const cell of regionOpenSingletons(level, cats, excluded)) forced.add(cell);
  return [...forced].sort((a, b) => a - b);
}

/**
 * Color-region singletons among open cells — the most obvious “下一只猫” cue
 * after exclude notes (matches how L1 teaches single-cell regions).
 */
export function regionOpenSingletons(
  level: LevelDefinition,
  cats: number[],
  excluded: ReadonlySet<number>,
): number[] {
  const size = level.size;
  const catSet = new Set(cats);
  const open = openCells(level, catSet, excluded);
  const regionHas = new Map<number, boolean>();
  for (const cat of cats) regionHas.set(level.regions[cat]!, true);

  const out: number[] = [];
  for (let rid = 0; rid < size; rid++) {
    if (regionHas.get(rid)) continue;
    const cells = open.filter((i) => level.regions[i] === rid);
    if (cells.length === 1 && isLegalVsCats(level, cats, cells[0]!)) out.push(cells[0]!);
  }
  return out.sort((a, b) => a - b);
}

function rowColExcluded(level: LevelDefinition, cat: number): Set<number> {
  const size = level.size;
  const r = rowOf(cat, size);
  const c = colOf(cat, size);
  const out = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (i === cat) continue;
    if (rowOf(i, size) === r || colOf(i, size) === c) out.add(i);
  }
  return out;
}

function adjExcluded(level: LevelDefinition, cat: number): Set<number> {
  return new Set(neighborIndexes(cat, level.size));
}

/**
 * L2: only one obvious cat at start; after placing it, excluding its row/col
 * is what reveals the next forced cat.
 */
export function level2RowColChainOk(level: LevelDefinition): boolean {
  const singles = singletonSolutionCats(level);
  if (singles.length !== 1) return false;
  const first = singles[0]!;
  const empty = new Set<number>();

  const forcedEmpty = beginnerForcedCats(level, [], empty);
  if (!forcedEmpty.includes(first)) return false;
  if (forcedEmpty.some((i) => i !== first)) return false;

  const afterPlace = beginnerForcedCats(level, [first], empty);
  if (afterPlace.length > 0) return false;

  const afterRowCol = beginnerForcedCats(level, [first], rowColExcluded(level, first));
  const solution = new Set(level.solution ?? []);
  return afterRowCol.some((i) => i !== first && solution.has(i));
}

/**
 * L3: first singleton is shown; excluding its 8-neighbors must shrink another
 * color region to a single open cell (obvious second cat). Row/col clears alone
 * must not already reveal it — adjacency is the lesson.
 */
export function level3AdjChainOk(level: LevelDefinition): boolean {
  const singles = singletonSolutionCats(level);
  if (singles.length !== 1) return false;
  const first = singles[0]!;
  const empty = new Set<number>();
  const solution = new Set(level.solution ?? []);

  // No extra obvious region after the pre-shown cat alone.
  if (regionOpenSingletons(level, [first], empty).length > 0) return false;

  // Row/col exclude of the first cat must NOT already create a region singleton.
  const afterRowCol = regionOpenSingletons(level, [first], rowColExcluded(level, first));
  if (afterRowCol.some((i) => solution.has(i))) return false;

  // Neighbor excludes must leave exactly one open cell in some other region,
  // and that cell must be a solution cat (legal vs the first cat).
  const afterAdj = regionOpenSingletons(level, [first], adjExcluded(level, first));
  const unlocked = afterAdj.filter((i) => i !== first && solution.has(i));
  if (unlocked.length < 1) return false;

  // Still obvious if the player also marks row/col afterwards.
  const both = new Set([...adjExcluded(level, first), ...rowColExcluded(level, first)]);
  const afterBoth = regionOpenSingletons(level, [first], both);
  return afterBoth.some((i) => unlocked.includes(i));
}

/**
 * L29 T2 teach: no free first cat; applying the pigeonhole exclude must unlock
 * at least one forced solution cat.
 */
export function level29NeedsT2ForFirstCat(level: LevelDefinition): boolean {
  if (firstForcedPlacement(level) != null) return false;
  if (beginnerForcedCats(level, [], new Set()).length > 0) return false;

  const demo = findBestPigeonExclude(level, 2);
  if (!demo || demo.regionIds.length < 2) return false;

  const after = beginnerForcedCats(level, [], new Set(demo.excludeCells));
  const solution = new Set(level.solution ?? []);
  return after.some((i) => solution.has(i));
}
