/**
 * Offline level generator for Cat Queens.
 * Run: npm run generate:levels
 * Optional: LEVEL_COUNT=500 npm run generate:levels
 *
 * Rules:
 * - Max board size 10×10 (phone-friendly)
 * - Levels 1–50 must be no-guess (deterministic forced moves only)
 * - Every level unique-solvable + difficulty stars/tier
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { verifyAllLevels } from '../assets/scripts/core/level/LevelQuality';
import { isNoGuessLevel, rateLevel } from '../assets/scripts/core/level/LevelDifficulty';
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

/** Classic Voronoi regions around solution seeds. */
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

  return repairConnectivity(size, solution, regions, rand);
}

/**
 * Easy-pack regions: keep several size-1 regions (instant forced cats) so
 * beginners can solve without guessing.
 */
function easyRegions(
  size: number,
  solution: number[],
  rand: () => number,
  singletonTarget: number,
): number[] | null {
  const regions = Array.from({ length: size * size }, () => -1);
  for (let i = 0; i < size; i++) regions[solution[i]!] = i;

  const order = shuffle(
    Array.from({ length: size }, (_, i) => i),
    rand,
  );
  const lockedSingletons = new Set(order.slice(0, Math.min(singletonTarget, size)));
  const growers = order.filter((i) => !lockedSingletons.has(i));
  if (growers.length === 0) growers.push(order[0]!);

  // Fill empty cells by expanding grower regions (4-neighbor)
  const frontier: number[] = [];
  for (const rid of growers) frontier.push(solution[rid]!);

  let guard = size * size * 4;
  while (regions.some((r) => r < 0) && guard-- > 0) {
    if (frontier.length === 0) {
      // Restart frontier from any grower-owned cell
      for (let i = 0; i < regions.length; i++) {
        if (growers.includes(regions[i]!)) frontier.push(i);
      }
      if (frontier.length === 0) break;
    }
    const cur = frontier[Math.floor(rand() * frontier.length)]!;
    const r = rowOf(cur, size);
    const c = colOf(cur, size);
    const rid = regions[cur]!;
    const neigh = shuffle(
      (
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const
      ).map(([dr, dc]) => [r + dr, c + dc] as const),
      rand,
    );
    let expanded = false;
    for (const [nr, nc] of neigh) {
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const n = nr * size + nc;
      if (regions[n]! >= 0) continue;
      regions[n] = rid;
      frontier.push(n);
      expanded = true;
      break;
    }
    if (!expanded) {
      const idx = frontier.indexOf(cur);
      if (idx >= 0) frontier.splice(idx, 1);
    }
  }

  // Any leftover empty → nearest grower seed
  for (let idx = 0; idx < regions.length; idx++) {
    if (regions[idx]! >= 0) continue;
    const r = rowOf(idx, size);
    const c = colOf(idx, size);
    let best = growers[0]!;
    let bestD = 1e9;
    for (const rid of growers) {
      const s = solution[rid]!;
      const d = Math.abs(rowOf(s, size) - r) + Math.abs(colOf(s, size) - c);
      if (d < bestD) {
        bestD = d;
        best = rid;
      }
    }
    regions[idx] = best;
  }

  return repairConnectivity(size, solution, regions, rand);
}

function repairConnectivity(
  size: number,
  solution: number[],
  regionsIn: number[],
  rand: () => number,
): number[] | null {
  const regions = [...regionsIn];
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

function solveTimeoutMs(size: number): number {
  if (size <= 6) return 800;
  if (size <= 7) return 1200;
  if (size <= 8) return 1800;
  if (size <= 9) return 2500;
  return 3500;
}

function regionCandidatesForCell(
  size: number,
  solution: number[],
  cur: number[],
  cell: number,
): number[] {
  const r = rowOf(cell, size);
  const c = colOf(cell, size);
  const candidates: number[] = [];
  for (const s of solution) {
    if (rowOf(s, size) === r || colOf(s, size) === c) candidates.push(cur[s]!);
  }
  for (const s of solution) {
    for (const n of neighborIndexes(s, size)) {
      if (Math.abs(rowOf(s, size) - rowOf(n, size)) + Math.abs(colOf(s, size) - colOf(n, size)) === 1) {
        candidates.push(cur[s]!);
      }
    }
  }
  return candidates;
}

function tryMakeUnique(
  size: number,
  solution: number[],
  regions: number[],
  rand: () => number,
): number[] | null {
  let cur = [...regions];
  const s1 = new Set(solution);
  const timeoutMs = solveTimeoutMs(size);
  const maxAttempts = size >= 9 ? 28 : size >= 8 ? 36 : 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level: LevelDefinition = {
      id: 1,
      size,
      regions: cur,
      solution: [...solution].sort((a, b) => a - b),
    };
    if (!puzzleValidator.validateLevel(level).ok) return null;
    const u = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs });
    if (u.status === 'ONE') return cur;
    if (u.status === 'TIMEOUT' || u.status === 'ZERO') return null;
    if (u.status !== 'MANY' || u.solutions.length < 2) return null;

    const alt =
      u.solutions.find((sol) => sol.some((c) => !s1.has(c))) ?? u.solutions[1]!;
    const next = [...cur];
    let changed = false;
    // Claim every alt-only cell in one pass (faster uniqueness pressure)
    for (const cell of shuffle([...alt], rand)) {
      if (s1.has(cell)) continue;
      const candidates = regionCandidatesForCell(size, solution, next, cell);
      if (!candidates.length) continue;
      const pick = candidates[Math.floor(rand() * candidates.length)]!;
      if (next[cell] !== pick) {
        next[cell] = pick;
        changed = true;
      }
    }
    if (changed && regionsAreFourConnected({ id: 1, size, regions: next })) {
      cur = next;
      continue;
    }
    // Fallback: mutate a random non-solution boundary cell
    const idx = Math.floor(rand() * size * size);
    if (!s1.has(idx)) {
      const candidates = regionCandidatesForCell(size, solution, cur, idx);
      if (candidates.length) {
        const trial = [...cur];
        trial[idx] = candidates[Math.floor(rand() * candidates.length)]!;
        if (regionsAreFourConnected({ id: 1, size, regions: trial })) cur = trial;
      }
    }
  }

  const level: LevelDefinition = {
    id: 1,
    size,
    regions: cur,
    solution: [...solution].sort((a, b) => a - b),
  };
  const u = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs });
  return u.status === 'ONE' ? cur : null;
}

/**
 * Board size curve — max 10 for phones.
 * Only levels 1–2 stay on 4×4 as a short onboarding; then ramp quickly.
 */
function sizeForLevel(id: number): number {
  if (id <= 2) return 4; // 两关引导即可
  if (id <= 16) return 5;
  if (id <= 70) return 6;
  if (id <= 160) return 7;
  if (id <= 300) return 8;
  if (id <= 420) return 9;
  return 10;
}

function requireNoGuess(id: number): boolean {
  return id <= 40;
}

function singletonTargetFor(id: number, size: number): number {
  if (id === 1) return size; // 几乎全是单格区，一眼能懂
  if (id === 2) return Math.max(2, size - 1); // 稍收一点，仍无猜想
  if (id <= 16) return Math.max(1, Math.floor(size / 2));
  if (id <= 40) return Math.max(1, Math.floor(size / 3));
  if (id <= 100) return Math.max(0, Math.floor(size / 4));
  if (size >= 10) return Math.max(3, Math.floor(size / 2));
  if (size >= 9) return Math.max(2, Math.floor(size / 3));
  if (size >= 8) return Math.max(1, Math.floor(size / 4));
  return 0;
}

function generateOne(id: number, seed: number): LevelDefinition | null {
  const size = sizeForLevel(id);
  const rand = mulberry32(seed);
  const needNoGuess = requireNoGuess(id);
  const singles = singletonTargetFor(id, size);
  const innerAttempts = size >= 9 ? 50 : size >= 7 ? 70 : 90;

  for (let attempt = 0; attempt < innerAttempts; attempt++) {
    const solution = placeSolution(size, rand);
    if (!solution) continue;

    const strategies: Array<() => number[] | null> = [];
    if (singles > 0) {
      strategies.push(() => easyRegions(size, solution, rand, singles));
      strategies.push(() => easyRegions(size, solution, rand, Math.max(0, singles - 1)));
    }
    strategies.push(() => voronoiRegions(size, solution, rand));
    strategies.push(() => easyRegions(size, solution, rand, Math.max(1, Math.floor(size / 2))));

    const pick = strategies[attempt % strategies.length]!;
    let regions = pick();
    if (!regions) continue;
    regions = tryMakeUnique(size, solution, regions, rand);
    if (!regions) continue;

    const level: LevelDefinition = {
      id,
      size,
      regions,
      solution: [...solution].sort((a, b) => a - b),
      chapterId: Math.ceil(id / 50),
    };
    if (!puzzleValidator.validateLevel(level).ok) continue;
    const unique = puzzleSolver.solve(level, {
      maxSolutions: 2,
      timeoutMs: solveTimeoutMs(size),
    });
    if (unique.status !== 'ONE') continue;

    const rating = rateLevel(level);
    if (needNoGuess && !rating.noGuess) continue;

    // Tutorial 1–2: keep stars at 入门
    if (id <= 2) {
      level.difficulty = 1;
      level.difficultyLabel = '入门';
    } else {
      level.difficulty = rating.stars;
      level.difficultyLabel = rating.tier;
    }
    level.noGuess = rating.noGuess;
    level.elite = id >= 100 && id % 25 === 0;
    return level;
  }
  return null;
}

function writePack(levels: LevelDefinition[]): void {
  const file = { schemaVersion: 1, levels };
  const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(file, null, 2));

  const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');
  mkdirSync(dirname(tsPath), { recursive: true });
  writeFileSync(
    tsPath,
    `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
      `/** Auto-generated pack (max 10×10). Re-run: npm run generate:levels */\n` +
      `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(file, null, 2)} as LevelsFile;\n`,
  );
}

function main(): void {
  const count = Number(process.env.LEVEL_COUNT ?? 500);
  const startId = Number(process.env.LEVEL_START ?? 1);
  const levels: LevelDefinition[] = [];
  let seed = 20261126 + startId * 997;
  const t0 = Date.now();

  for (let id = startId; id <= count; id++) {
    let level: LevelDefinition | null = null;
    const maxRetry = requireNoGuess(id) ? 250 : sizeForLevel(id) >= 7 ? 220 : 120;
    for (let retry = 0; retry < maxRetry && !level; retry++) {
      level = generateOne(id, seed++);
    }
    if (!level) {
      console.error(`Failed to generate level ${id} (size=${sizeForLevel(id)})`);
      process.exit(1);
    }
    levels.push(level);
    if (id % 25 === 0 || id === count) {
      const ng = levels.filter((l) => l.noGuess).length;
      console.log(
        `generated ${id}/${count} · batchNoGuess=${ng} · last=${level.size}x${level.size} ${level.difficultyLabel}${level.difficulty} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      // Checkpoint so long runs are not lost
      if (startId === 1) writePack(levels);
    }
  }

  const quality = verifyAllLevels(levels, Math.max(5000, solveTimeoutMs(10) + 1000));
  if (quality.fail.length) {
    console.error('Quality gate failed', quality.fail.slice(0, 20));
    process.exit(1);
  }

  if (startId === 1) {
    const tutorial = levels.filter((l) => l.id <= 2);
    if (tutorial.some((l) => l.size !== 4 || !l.noGuess)) {
      console.error(
        'Levels 1–2 must be 4×4 no-guess onboarding',
        tutorial.map((l) => ({ id: l.id, size: l.size, noGuess: l.noGuess })),
      );
      process.exit(1);
    }
    if (levels.some((l) => l.id >= 3 && l.id <= 16 && l.size !== 5)) {
      console.error('Levels 3–16 should be 5×5');
      process.exit(1);
    }
    const early = levels.filter((l) => l.id <= 40);
    const badEasy = early.filter((l) => !l.noGuess);
    if (badEasy.length) {
      console.error(
        'First 40 must be no-guess',
        badEasy.map((l) => l.id),
      );
      process.exit(1);
    }
  }

  writePack(levels);

  const byTier: Record<string, number> = {};
  const bySize: Record<number, number> = {};
  for (const l of levels) {
    byTier[l.difficultyLabel ?? '?'] = (byTier[l.difficultyLabel ?? '?'] ?? 0) + 1;
    bySize[l.size] = (bySize[l.size] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        total: levels.length,
        range: [startId, count],
        noGuess: levels.filter((l) => l.noGuess).length,
        tutorial1to2:
          startId === 1
            ? levels
                .filter((l) => l.id <= 2)
                .every((l) => l.size === 4 && l.noGuess)
            : undefined,
        first40NoGuess:
          startId === 1 ? levels.filter((l) => l.id <= 40).every((l) => l.noGuess) : undefined,
        maxSize: Math.max(...levels.map((l) => l.size)),
        byTier,
        bySize,
        elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
      },
      null,
      2,
    ),
  );
}

main();
