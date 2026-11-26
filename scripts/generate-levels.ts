/**
 * Offline level generator for Cat Queens.
 * Run: npm run generate:levels
 * Optional: LEVEL_COUNT=100 npm run generate:levels
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { verifyAllLevels } from '../assets/scripts/core/level/LevelQuality';
import { puzzleSolver } from '../assets/scripts/core/puzzle/PuzzleSolver';
import { puzzleValidator } from '../assets/scripts/core/puzzle/PuzzleValidator';
import { neighborIndexes, regionsAreFourConnected } from '../assets/scripts/core/puzzle/PuzzleRules';
import { colOf, rowOf } from '../assets/scripts/core/puzzle/PuzzleTypes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function placeSolution(size: number, rand: () => number): number[] | null {
  const rowUsed = Array.from({ length: size }, () => false);
  const colUsed = Array.from({ length: size }, () => false);
  const cats: number[] = [];
  const catSet = new Set<number>();

  const ok = (idx: number): boolean => {
    const r = rowOf(idx, size);
    const c = colOf(idx, size);
    if (rowUsed[r] || colUsed[c]) return false;
    for (const n of neighborIndexes(idx, size)) if (catSet.has(n)) return false;
    return true;
  };

  const dfs = (row: number): boolean => {
    if (row === size) return true;
    for (const c of shuffle(
      Array.from({ length: size }, (_, i) => i),
      rand,
    )) {
      const idx = row * size + c;
      if (!ok(idx)) continue;
      rowUsed[row] = true;
      colUsed[c] = true;
      cats.push(idx);
      catSet.add(idx);
      if (dfs(row + 1)) return true;
      cats.pop();
      catSet.delete(idx);
      rowUsed[row] = false;
      colUsed[c] = false;
    }
    return false;
  };

  return dfs(0) ? [...cats] : null;
}

function voronoiRegions(size: number, solution: number[], rand: () => number): number[] | null {
  const regions = Array.from({ length: size * size }, () => -1);
  for (let i = 0; i < size; i++) regions[solution[i]!] = i;

  for (let idx = 0; idx < size * size; idx++) {
    if (regions[idx]! >= 0) continue;
    const r = rowOf(idx, size);
    const c = colOf(idx, size);
    let best: number[] = [];
    let bestD = 1e9;
    for (let i = 0; i < size; i++) {
      const s = solution[i]!;
      const d = Math.abs(rowOf(s, size) - r) + Math.abs(colOf(s, size) - c);
      if (d < bestD) {
        bestD = d;
        best = [i];
      } else if (d === bestD) best.push(i);
    }
    regions[idx] = best[Math.floor(rand() * best.length)]!;
  }

  for (let iter = 0; iter < size * size; iter++) {
    if (regionsAreFourConnected({ id: 1, size, regions })) break;
    const by: number[][] = Array.from({ length: size }, () => []);
    for (let i = 0; i < regions.length; i++) by[regions[i]!]!.push(i);
    let fixed = false;
    for (let rid = 0; rid < size; rid++) {
      const cells = by[rid]!;
      const start = solution[rid]!;
      const seen = new Set<number>([start]);
      const q = [start];
      while (q.length) {
        const cur = q.pop()!;
        const r = rowOf(cur, size);
        const c = colOf(cur, size);
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
          const n = nr * size + nc;
          if (regions[n] !== rid || seen.has(n)) continue;
          seen.add(n);
          q.push(n);
        }
      }
      for (const cell of cells) {
        if (seen.has(cell)) continue;
        const r = rowOf(cell, size);
        const c = colOf(cell, size);
        const opts: number[] = [];
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
          const n = nr * size + nc;
          if (regions[n] !== rid) opts.push(regions[n]!);
        }
        if (opts.length) {
          regions[cell] = opts[Math.floor(rand() * opts.length)]!;
          fixed = true;
        }
      }
    }
    if (!fixed) break;
  }

  return regionsAreFourConnected({ id: 1, size, regions }) ? regions : null;
}

function tryMakeUnique(
  size: number,
  solution: number[],
  regions: number[],
  rand: () => number,
): number[] | null {
  let cur = [...regions];
  const s1 = new Set(solution);

  for (let attempt = 0; attempt < 50; attempt++) {
    const level: LevelDefinition = {
      id: 1,
      size,
      regions: cur,
      solution: [...solution].sort((a, b) => a - b),
    };
    if (!puzzleValidator.validateLevel(level).ok) return null;
    const u = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 1200 });
    if (u.status === 'ONE') return cur;
    if (u.status !== 'MANY' || u.solutions.length < 2) return null;

    const alt =
      u.solutions.find((sol) => sol.some((c) => !s1.has(c))) ?? u.solutions[1]!;
    for (const cell of alt) {
      if (s1.has(cell)) continue;
      const r = rowOf(cell, size);
      const c = colOf(cell, size);
      const candidates: number[] = [];
      for (const s of solution) {
        if (rowOf(s, size) === r || colOf(s, size) === c) candidates.push(cur[s]!);
      }
      for (const s of solution) {
        for (const n of neighborIndexes(s, size)) {
          const rr = rowOf(s, size);
          const cc = colOf(s, size);
          const nr = rowOf(n, size);
          const nc = colOf(n, size);
          if (Math.abs(rr - nr) + Math.abs(cc - nc) === 1) candidates.push(cur[s]!);
        }
      }
      if (!candidates.length) continue;
      const next = [...cur];
      next[cell] = candidates[Math.floor(rand() * candidates.length)]!;
      if (regionsAreFourConnected({ id: 1, size, regions: next })) cur = next;
    }
  }

  const level: LevelDefinition = {
    id: 1,
    size,
    regions: cur,
    solution: [...solution].sort((a, b) => a - b),
  };
  const u = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 1200 });
  return u.status === 'ONE' ? cur : null;
}

function sizeForLevel(id: number): number {
  if (id <= 10) return 4;
  if (id <= 25) return 5;
  if (id <= 45) return 6;
  if (id <= 70) return 7;
  if (id <= 100) return 8;
  return 8;
}

function generateOne(id: number, seed: number): LevelDefinition | null {
  const size = sizeForLevel(id);
  const rand = mulberry32(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const solution = placeSolution(size, rand);
    if (!solution) continue;
    let regions = voronoiRegions(size, solution, rand);
    if (!regions) continue;
    regions = tryMakeUnique(size, solution, regions, rand);
    if (!regions) continue;
    const level: LevelDefinition = {
      id,
      size,
      regions,
      solution: [...solution].sort((a, b) => a - b),
      chapterId: Math.ceil(id / 50),
      difficulty: size * 6 + (id % 10),
      elite: id >= 20 && id % 10 === 0,
    };
    if (!puzzleValidator.validateLevel(level).ok) continue;
    const unique = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 2000 });
    if (unique.status !== 'ONE') continue;
    return level;
  }
  return null;
}

function main(): void {
  const count = Number(process.env.LEVEL_COUNT ?? 50);
  const levels: LevelDefinition[] = [];
  let seed = 20261126;
  for (let id = 1; id <= count; id++) {
    let level: LevelDefinition | null = null;
    for (let retry = 0; retry < 80 && !level; retry++) {
      level = generateOne(id, seed++);
    }
    if (!level) {
      console.error(`Failed to generate level ${id}`);
      process.exit(1);
    }
    levels.push(level);
    if (id % 10 === 0) console.log(`generated ${id}/${count}`);
  }

  // Final hard gate — refuse to write any non-unique pack
  const quality = verifyAllLevels(levels, 4000);
  if (quality.fail.length) {
    console.error('Quality gate failed', quality.fail);
    process.exit(1);
  }

  const file = { schemaVersion: 1, levels };
  const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(file, null, 2));

  const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');
  mkdirSync(dirname(tsPath), { recursive: true });
  writeFileSync(
    tsPath,
    `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
      `/** Auto-generated starter pack. Re-run: npm run generate:levels */\n` +
      `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(file, null, 2)} as LevelsFile;\n`,
  );
  console.log(`Wrote ${levels.length} levels (all unique-verified)`);
}

main();
