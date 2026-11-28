import type { LevelDefinition } from './PuzzleTypes';
import { colOf, rowOf } from './PuzzleTypes';

const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

export function inBounds(row: number, col: number, size: number): boolean {
  return row >= 0 && col >= 0 && row < size && col < size;
}

export function areAdjacent8(a: number, b: number, size: number): boolean {
  const ar = rowOf(a, size);
  const ac = colOf(a, size);
  const br = rowOf(b, size);
  const bc = colOf(b, size);
  const dr = Math.abs(ar - br);
  const dc = Math.abs(ac - bc);
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

export function neighborIndexes(index: number, size: number): number[] {
  const r = rowOf(index, size);
  const c = colOf(index, size);
  const out: number[] = [];
  for (const [dr, dc] of NEIGHBOR_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc, size)) out.push(nr * size + nc);
  }
  return out;
}

/** Every region must be 4-neighbor connected. */
export function regionsAreFourConnected(level: LevelDefinition): boolean {
  const { size, regions } = level;
  const regionCells = new Map<number, number[]>();
  for (let i = 0; i < regions.length; i++) {
    const id = regions[i]!;
    const list = regionCells.get(id);
    if (list) list.push(i);
    else regionCells.set(id, [i]);
  }

  for (const cells of regionCells.values()) {
    if (cells.length === 0) return false;
    const target = new Set(cells);
    const start = cells[0]!;
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.pop()!;
      const r = rowOf(cur, size);
      const c = colOf(cur, size);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc, size)) continue;
        const ni = nr * size + nc;
        if (!target.has(ni) || seen.has(ni)) continue;
        seen.add(ni);
        queue.push(ni);
      }
    }
    if (seen.size !== target.size) return false;
  }
  return true;
}

export function uniqueRegionIds(regions: number[]): number[] {
  return [...new Set(regions)].sort((a, b) => a - b);
}
