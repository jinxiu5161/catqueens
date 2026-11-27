import { neighborIndexes } from '../puzzle/PuzzleRules';
import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { colOf, rowOf } from '../puzzle/PuzzleTypes';
import { singletonSolutionCats } from './TechniqueCoach';

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
  for (let rid = 0; rid < size; rid++) {
    if (regionHas.get(rid)) continue;
    const cells = open.filter((i) => level.regions[i] === rid);
    if (cells.length === 1 && isLegalVsCats(level, cats, cells[0]!)) forced.add(cells[0]!);
  }
  return [...forced].sort((a, b) => a - b);
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
 * L3: first singleton is shown; excluding its neighbors is what reveals the
 * next forced cat (not row/col clears alone).
 */
export function level3AdjChainOk(level: LevelDefinition): boolean {
  const singles = singletonSolutionCats(level);
  if (singles.length < 1) return false;
  const first = singles[0]!;
  const empty = new Set<number>();

  // Prefer exactly one singleton so the pre-shown cat is unambiguous.
  if (singles.length !== 1) return false;

  const afterPlace = beginnerForcedCats(level, [first], empty);
  if (afterPlace.length > 0) return false;

  // Row/col exclude alone should NOT be enough — adjacency is the lesson.
  const afterRowCol = beginnerForcedCats(level, [first], rowColExcluded(level, first));
  if (afterRowCol.some((i) => i !== first)) return false;

  const afterAdj = beginnerForcedCats(level, [first], adjExcluded(level, first));
  const solution = new Set(level.solution ?? []);
  return afterAdj.some((i) => i !== first && solution.has(i));
}
