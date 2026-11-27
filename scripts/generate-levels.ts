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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { verifyAllLevels } from '../assets/scripts/core/level/LevelQuality';
import {
  countSingletonRegions,
  levelHardness,
  rateLevel,
} from '../assets/scripts/core/level/LevelDifficulty';
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
  if (size <= 8) return 1600;
  if (size <= 9) return 2000;
  return 2200; // fail fast; outer retries vary the seed instead
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
 * 1–2: 4×4 guided tips; 3–7: more 4×4 practice (no tip spam);
 * 8+: first 5×5 (same beat as before).
 */
function sizeForLevel(id: number): number {
  if (id <= 7) return 4;
  if (id <= 22) return 5; // 第 8 关起五乘五
  if (id <= 70) return 6;
  if (id <= 160) return 7;
  if (id <= 300) return 8;
  if (id <= 420) return 9;
  return 10;
}

function requireNoGuess(id: number): boolean {
  return id <= 40;
}

/** Inclusive id range for a board-size stage. */
function stageRangeForSize(size: number): { start: number; end: number } {
  const ranges: Record<number, { start: number; end: number }> = {
    4: { start: 1, end: 7 },
    5: { start: 8, end: 22 },
    6: { start: 23, end: 70 },
    7: { start: 71, end: 160 },
    8: { start: 161, end: 300 },
    9: { start: 301, end: 420 },
    10: { start: 421, end: 500 },
  };
  return ranges[size] ?? { start: 1, end: 500 };
}

/**
 * Within each size stage, singleton target decreases from high → low as id grows.
 */
function singletonTargetFor(id: number, size: number): number {
  const { start, end } = stageRangeForSize(size);
  const span = Math.max(1, end - start);
  const t = Math.min(1, Math.max(0, (id - start) / span));
  // Stage start: many freebies; stage end: fewer — never force S=0 on large boards
  // (0-singleton unique packs are extremely slow above 7×7).
  const maxS = size <= 5 ? size : Math.max(3, Math.floor(size * 0.65));
  const minS = singletonFloor(size);
  return Math.max(minS, Math.round(maxS - t * (maxS - minS)));
}

function singletonFloor(size: number): number {
  if (size <= 5) return 1;
  if (size <= 7) return 1;
  if (size <= 8) return 2;
  if (size <= 9) return 3;
  return 4; // 10×10: keep enough singletons for tractable uniqueness
}

function boardFingerprint(level: LevelDefinition): string {
  return `${level.size}|R:${level.regions.join(',')}|S:${level.solution.join(',')}`;
}

function solutionFingerprint(level: LevelDefinition): string {
  return `${level.size}|${[...level.solution].sort((a, b) => a - b).join(',')}`;
}

/** Relabel region ids by first-seen order so color-id swaps still match. */
function canonicalBoardFingerprint(level: LevelDefinition): string {
  const map = new Map<number, number>();
  let next = 0;
  const canon = level.regions.map((rid) => {
    let mapped = map.get(rid);
    if (mapped === undefined) {
      mapped = next++;
      map.set(rid, mapped);
    }
    return mapped;
  });
  return `${level.size}|R:${canon.join(',')}|S:${[...level.solution].sort((a, b) => a - b).join(',')}`;
}

function generateOne(
  id: number,
  seed: number,
  opts: {
    maxSingletons: number;
    usedBoards: Set<string>;
    usedCanonical: Set<string>;
    usedSolutions: Set<string>;
    prevSolutionKey: string | null;
    /** 4×4 only has 2 cat layouts — allow reuse after trying to alternate. */
    strictNewSolution: boolean;
  },
): LevelDefinition | null {
  const size = sizeForLevel(id);
  const needNoGuess = requireNoGuess(id);
  const singles = opts.maxSingletons; // caller already applied schedule + smooth drop
  const innerAttempts = size >= 9 ? 80 : size >= 7 ? 110 : 160;

  for (let attempt = 0; attempt < innerAttempts; attempt++) {
    // Mix id+attempt into seed so consecutive levels don't recycle the same stream
    const rand = mulberry32((seed + attempt * 0x9e3779b9 + id * 0x85ebca6b) >>> 0);
    const solution = placeSolution(size, rand);
    if (!solution) continue;
    const solKey = `${size}|${[...solution].sort((a, b) => a - b).join(',')}`;
    if (opts.strictNewSolution && opts.usedSolutions.has(solKey)) continue;
    // Prefer alternating solution vs previous (especially tiny boards)
    if (
      opts.prevSolutionKey &&
      solKey === opts.prevSolutionKey &&
      attempt < Math.floor(innerAttempts * 0.7)
    ) {
      continue;
    }

    // Prefer exact singleton budget; also try one fewer (harder), never more
    const strategies: Array<() => number[] | null> = [];
    const floor = singletonFloor(size);
    strategies.push(() => easyRegions(size, solution, rand, singles));
    if (singles > floor) {
      strategies.push(() => easyRegions(size, solution, rand, Math.max(floor, singles - 1)));
    }
    if (singles <= floor + 1) {
      strategies.push(() => voronoiRegions(size, solution, rand));
    }

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

    const boardKey = boardFingerprint(level);
    const canonKey = canonicalBoardFingerprint(level);
    if (opts.usedBoards.has(boardKey) || opts.usedCanonical.has(canonKey)) continue;

    const unique = puzzleSolver.solve(level, {
      maxSolutions: 2,
      timeoutMs: solveTimeoutMs(size),
    });
    if (unique.status !== 'ONE') continue;

    const rating = rateLevel(level);
    if (needNoGuess && !rating.noGuess) continue;

    const gotSingles = countSingletonRegions(level);
    // Easier = more singletons than allowed → discard
    if (gotSingles > singles) continue;
    if (gotSingles < floor) continue;
    // Smooth descent: at most one singleton step below this level's target
    if (gotSingles < singles - 1) continue;

    // Early 4×4 stay 入门; guided tips only on 1–2 in UI
    if (id <= 7) {
      level.difficulty = id <= 2 ? 1 : Math.min(2, rating.stars);
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
  let seed = 20261126 + startId * 9973;
  const t0 = Date.now();

  // Resume: keep levels before startId from existing pack when present
  const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
  if (startId > 1 && existsSync(jsonPath)) {
    try {
      const prev = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        levels: LevelDefinition[];
      };
      for (const l of prev.levels) {
        if (l.id < startId) levels.push(l);
      }
      levels.sort((a, b) => a.id - b.id);
      console.log(`resuming from ${startId}, kept ${levels.length} prior levels`);
    } catch {
      /* ignore */
    }
  }

  let prevSize = -1;
  let prevSingletons = Number.POSITIVE_INFINITY;
  const usedBoards = new Set<string>();
  const usedCanonical = new Set<string>();
  const usedSolutions = new Set<string>();
  let prevSolutionKey: string | null = null;
  if (levels.length) {
    const last = levels[levels.length - 1]!;
    prevSize = last.size;
    prevSingletons = countSingletonRegions(last);
    prevSolutionKey = solutionFingerprint(last);
    for (const l of levels) {
      usedBoards.add(boardFingerprint(l));
      usedCanonical.add(canonicalBoardFingerprint(l));
      usedSolutions.add(solutionFingerprint(l));
    }
  }

  for (let id = startId; id <= count; id++) {
    const size = sizeForLevel(id);
    if (size !== prevSize) {
      // New size stage: reset freeness + solution pool (boards stay global)
      prevSingletons = Number.POSITIVE_INFINITY;
      prevSize = size;
      prevSolutionKey = null;
      usedSolutions.clear();
    }

    let level: LevelDefinition | null = null;
    // Follow schedule, never rise vs previous, drop by at most 1 per level
    const scheduled = singletonTargetFor(id, size);
    const target =
      prevSingletons === Number.POSITIVE_INFINITY
        ? scheduled
        : Math.min(prevSingletons, Math.max(scheduled, prevSingletons - 1));
    const maxRetry = requireNoGuess(id) ? 700 : size >= 7 ? 420 : 320;
    for (let retry = 0; retry < maxRetry && !level; retry++) {
      // Late retries: hold singleton count if a drop is scarce
      const tryTarget =
        retry > maxRetry * 0.6 && prevSingletons < Number.POSITIVE_INFINITY
          ? Math.min(prevSingletons, target + 1)
          : target;
      level = generateOne(id, seed++, {
        maxSingletons: Math.min(tryTarget, prevSingletons),
        usedBoards,
        usedCanonical,
        usedSolutions,
        prevSolutionKey,
        // 4×4 has only 2 legal cat layouts; 5×5 has 14 for 15 levels — soft late
        strictNewSolution: size >= 5 && retry < maxRetry * 0.75,
      });
    }
    if (!level) {
      console.error(
        `Failed to generate level ${id} (size=${size}, prevS=${prevSingletons}, target=${target})`,
      );
      process.exit(1);
    }
    const singles = countSingletonRegions(level);
    const hard = levelHardness(level);
    prevSingletons = singles;
    usedBoards.add(boardFingerprint(level));
    usedCanonical.add(canonicalBoardFingerprint(level));
    usedSolutions.add(solutionFingerprint(level));
    prevSolutionKey = solutionFingerprint(level);
    levels.push(level);
    if (id % 25 === 0 || id === count) {
      const ng = levels.filter((l) => l.noGuess).length;
      console.log(
        `generated ${id}/${count} · batchNoGuess=${ng} · last=${level.size}x${level.size} S${singles} H${hard} ${level.difficultyLabel}${level.difficulty} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      if (startId === 1) writePack(levels);
    }
  }

  const quality = verifyAllLevels(levels, Math.max(5000, solveTimeoutMs(10) + 1000));
  if (quality.fail.length) {
    console.error('Quality gate failed', quality.fail.slice(0, 20));
    process.exit(1);
  }

  if (startId === 1) {
    const four = levels.filter((l) => l.id <= 7);
    if (four.some((l) => l.size !== 4 || !l.noGuess)) {
      console.error(
        'Levels 1–7 must be 4×4 no-guess',
        four.map((l) => ({ id: l.id, size: l.size, noGuess: l.noGuess })),
      );
      process.exit(1);
    }
    const level8 = levels.find((l) => l.id === 8);
    if (!level8 || level8.size !== 5) {
      console.error('Level 8 must be 5×5', level8);
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

    // No duplicate boards (exact or color-relabel isomorphic)
    const seenBoard = new Set<string>();
    const seenCanon = new Set<string>();
    for (const l of levels) {
      const b = boardFingerprint(l);
      const c = canonicalBoardFingerprint(l);
      if (seenBoard.has(b) || seenCanon.has(c)) {
        console.error(`Duplicate board at level ${l.id}`);
        process.exit(1);
      }
      seenBoard.add(b);
      seenCanon.add(c);
    }

    // Within each size stage: singletons never increase (not easier by freebies)
    for (let i = 1; i < levels.length; i++) {
      const a = levels[i - 1]!;
      const b = levels[i]!;
      if (a.size !== b.size) continue;
      const sa = countSingletonRegions(a);
      const sb = countSingletonRegions(b);
      if (sb > sa) {
        console.error(`Singleton increased within stage at level ${b.id}: ${sa} → ${sb}`);
        process.exit(1);
      }
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
        levels1to7_4x4:
          startId === 1
            ? levels.filter((l) => l.id <= 7).every((l) => l.size === 4 && l.noGuess)
            : undefined,
        level8_5x5: startId === 1 ? levels.find((l) => l.id === 8)?.size === 5 : undefined,
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
