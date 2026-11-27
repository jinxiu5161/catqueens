/**
 * Offline level generator — technique curriculum T0–T6.
 * Run: npm run generate:levels
 * Optional: LEVEL_COUNT=500 npm run generate:levels
 *
 * Design: teach → practice, board size may dip when a new technique is introduced.
 * Max board 10×10.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { verifyAllLevels } from '../assets/scripts/core/level/LevelQuality';
import { countSingletonRegions, rateLevel } from '../assets/scripts/core/level/LevelDifficulty';
import {
  TECHNIQUE_LABELS,
  analyzeTechniques,
  curriculumFor,
  type Lesson,
  type TechniqueId,
} from '../assets/scripts/core/level/LevelTechniques';
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

export function placeSolution(size: number, rand: () => number): number[] | null {
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

  const frontier: number[] = [];
  for (const rid of growers) frontier.push(solution[rid]!);

  let guard = size * size * 4;
  while (regions.some((r) => r < 0) && guard-- > 0) {
    if (frontier.length === 0) {
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

/** T1: force one region into a 2–3 cell strip on one row or column. */
function linePinRegions(
  size: number,
  solution: number[],
  rand: () => number,
  along: 'row' | 'col',
): number[] | null {
  const rid = Math.floor(rand() * size);
  const seed = solution[rid]!;
  const sr = rowOf(seed, size);
  const sc = colOf(seed, size);
  const strip: number[] = [seed];
  const deltas = shuffle([-1, 1, -2, 2], rand);
  for (const d of deltas) {
    if (strip.length >= 3) break;
    const nr = along === 'row' ? sr : sr + d;
    const nc = along === 'row' ? sc + d : sc;
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
    const idx = nr * size + nc;
    if (solution.includes(idx) && idx !== seed) continue;
    strip.push(idx);
  }
  if (strip.length < 2) return null;

  const regions = Array.from({ length: size * size }, () => -1);
  for (let i = 0; i < size; i++) regions[solution[i]!] = i;
  for (const cell of strip) regions[cell] = rid;

  // Grow everyone except keep strip cells locked to rid
  const locked = new Set(strip);
  const base = voronoiRegions(size, solution, rand);
  if (!base) return null;
  for (let i = 0; i < regions.length; i++) {
    if (locked.has(i)) continue;
    regions[i] = base[i]!;
  }
  for (const cell of strip) regions[cell] = rid;
  return repairConnectivity(size, solution, regions, rand);
}

/**
 * T2/T4: k regions whose cats sit in k lines are confined to those k lines.
 */
export function pigeonholeRegions(
  size: number,
  solution: number[],
  rand: () => number,
  k: number,
  axis: 'row' | 'col',
): number[] | null {
  if (k < 2 || k > size) return null;
  const lines = shuffle(
    Array.from({ length: size }, (_, i) => i),
    rand,
  ).slice(0, k);
  const lineSet = new Set(lines);

  const pigeonRids: number[] = [];
  for (let rid = 0; rid < size; rid++) {
    const cell = solution[rid]!;
    const line = axis === 'col' ? colOf(cell, size) : rowOf(cell, size);
    if (lineSet.has(line)) pigeonRids.push(rid);
  }
  if (pigeonRids.length !== k) return null;
  const otherRids = Array.from({ length: size }, (_, i) => i).filter((r) => !pigeonRids.includes(r));

  const regions = Array.from({ length: size * size }, () => -1);
  for (let i = 0; i < size; i++) regions[solution[i]!] = i;

  const inPigeonBand = (idx: number) => {
    const line = axis === 'col' ? colOf(idx, size) : rowOf(idx, size);
    return lineSet.has(line);
  };

  for (let idx = 0; idx < size * size; idx++) {
    if (regions[idx]! >= 0) continue;
    const r = rowOf(idx, size);
    const c = colOf(idx, size);
    const pool = inPigeonBand(idx) ? pigeonRids : otherRids;
    if (!pool.length) return null;
    let best: number[] = [];
    let bestD = 1e9;
    for (const rid of pool) {
      const s = solution[rid]!;
      const d = Math.abs(rowOf(s, size) - r) + Math.abs(colOf(s, size) - c);
      if (d < bestD) {
        bestD = d;
        best = [rid];
      } else if (d === bestD) best.push(rid);
    }
    regions[idx] = best[Math.floor(rand() * best.length)]!;
  }

  // Enforce confinement: pigeon regions cannot own cells outside the band
  for (let idx = 0; idx < size * size; idx++) {
    const rid = regions[idx]!;
    if (pigeonRids.includes(rid) && !inPigeonBand(idx)) {
      if (!otherRids.length) return null;
      regions[idx] = otherRids[Math.floor(rand() * otherRids.length)]!;
    }
    if (otherRids.includes(rid) && inPigeonBand(idx)) {
      // leave to repair / voronoi among pigeon — reassign to nearest pigeon
      let best = pigeonRids[0]!;
      let bestD = 1e9;
      const r = rowOf(idx, size);
      const c = colOf(idx, size);
      for (const prid of pigeonRids) {
        const s = solution[prid]!;
        const d = Math.abs(rowOf(s, size) - r) + Math.abs(colOf(s, size) - c);
        if (d < bestD) {
          bestD = d;
          best = prid;
        }
      }
      regions[idx] = best;
    }
  }

  return repairConnectivity(size, solution, regions, rand);
}

/** T5 proxy: at least two size-2 line-pinned regions, no singletons. */
function dualPairRegions(size: number, solution: number[], rand: () => number): number[] | null {
  const along: 'row' | 'col' = rand() < 0.5 ? 'row' : 'col';
  let regions = linePinRegions(size, solution, rand, along);
  if (!regions) return null;
  // Try pinning a second region
  const second = linePinRegions(size, solution, rand, along === 'row' ? 'col' : 'row');
  if (second) {
    // Merge: keep second's strip cells for its rid where not conflicting seeds
    const counts = new Map<number, number>();
    for (const rid of second) counts.set(rid, (counts.get(rid) ?? 0) + 1);
    // Prefer second board if it already has line pins
    regions = second;
  }
  // Strip singletons by growing them into neighbors
  const by: number[][] = Array.from({ length: size }, () => []);
  for (let i = 0; i < regions.length; i++) by[regions[i]!]!.push(i);
  for (let rid = 0; rid < size; rid++) {
    if (by[rid]!.length !== 1) continue;
    const cell = by[rid]![0]!;
    const r = rowOf(cell, size);
    const c = colOf(cell, size);
    for (const [dr, dc] of shuffle(
      [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const,
      rand,
    )) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const n = nr * size + nc;
      if (solution.includes(n)) continue;
      const other = regions[n]!;
      if (by[other]!.length <= 2) continue;
      regions[n] = rid;
      break;
    }
  }
  return repairConnectivity(size, solution, regions, rand);
}

function solveTimeoutMs(size: number): number {
  if (size <= 6) return 800;
  if (size <= 7) return 1200;
  if (size <= 8) return 1600;
  if (size <= 9) return 2000;
  return 2200;
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
  allowAssign?: (cell: number, rid: number) => boolean,
): number[] | null {
  let cur = [...regions];
  const s1 = new Set(solution);
  const timeoutMs = solveTimeoutMs(size);
  const maxAttempts = size >= 9 ? 28 : size >= 8 ? 36 : 50;
  const okAssign = (cell: number, rid: number) => (allowAssign ? allowAssign(cell, rid) : true);

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

    const alt = u.solutions.find((sol) => sol.some((c) => !s1.has(c))) ?? u.solutions[1]!;
    const next = [...cur];
    let changed = false;
    for (const cell of shuffle([...alt], rand)) {
      if (s1.has(cell)) continue;
      const candidates = regionCandidatesForCell(size, solution, next, cell).filter((rid) =>
        okAssign(cell, rid),
      );
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

function boardFingerprint(level: LevelDefinition): string {
  return `${level.size}|R:${level.regions.join(',')}|S:${level.solution!.join(',')}`;
}

function solutionFingerprint(level: LevelDefinition): string {
  return `${level.size}|${[...level.solution!].sort((a, b) => a - b).join(',')}`;
}

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
  return `${level.size}|R:${canon.join(',')}|S:${[...level.solution!].sort((a, b) => a - b).join(',')}`;
}

function matchesLesson(level: LevelDefinition, lesson: Lesson, soft = false): boolean {
  const flags = analyzeTechniques(level);
  const singles = flags.singletonCount;
  if (singles < lesson.minSingles || singles > lesson.maxSingles) return false;
  if (lesson.requireNoGuess && !flags.noGuess) return false;
  // T6 must actually need guessing; other techniques may be guess or no-guess
  if (lesson.technique === 'T6' && flags.noGuess && !soft) return false;
  if (lesson.requireLinePin && !flags.hasLinePin) return false;
  if (lesson.requirePigeonhole === 2) {
    if (!soft && !(flags.hasPigeonhole2 || flags.hasLinePin)) return false;
  }
  if (lesson.requirePigeonhole === 3) {
    // k=3 is scarce after uniquify; accept k=2 / line-pin; soft = any noGuess in range
    if (!soft && !(flags.hasPigeonhole3 || flags.hasPigeonhole2 || flags.hasLinePin)) return false;
  }
  if (lesson.preferDualPairs) {
    if (!(flags.size2RegionCount >= 1 || flags.hasLinePin || flags.hasPigeonhole2 || soft)) {
      return false;
    }
  }
  return true;
}

function starsForLesson(lesson: Lesson, ratingStars: number): { stars: number; label: string } {
  const base: Record<TechniqueId, number> = {
    T0: 1,
    T1: 2,
    T2: 3,
    T3: 3,
    T4: 5,
    T5: 6,
    T6: 8,
  };
  let stars = Math.max(base[lesson.technique], Math.min(10, ratingStars));
  if (lesson.size >= 9) stars = Math.min(10, stars + 1);
  if (lesson.technique === 'T6') stars = Math.max(7, stars);
  const label =
    stars <= 2 ? '入门' : stars <= 3 ? '简单' : stars <= 5 ? '普通' : stars <= 6 ? '进阶' : stars <= 8 ? '困难' : '专家';
  return { stars, label };
}

function generateOne(
  id: number,
  seed: number,
  lesson: Lesson,
  opts: {
    usedBoards: Set<string>;
    usedCanonical: Set<string>;
    usedSolutions: Set<string>;
    prevSolutionKey: string | null;
    strictNewSolution: boolean;
  },
): LevelDefinition | null {
  const size = lesson.size;
  const innerAttempts = size >= 9 ? 36 : size >= 8 ? 48 : size >= 7 ? 55 : 90;

  for (let attempt = 0; attempt < innerAttempts; attempt++) {
    const rand = mulberry32((seed + attempt * 0x9e3779b9 + id * 0x85ebca6b) >>> 0);
    const solution = placeSolution(size, rand);
    if (!solution) continue;
    const solKey = `${size}|${[...solution].sort((a, b) => a - b).join(',')}`;
    if (opts.strictNewSolution && opts.usedSolutions.has(solKey)) continue;
    if (
      opts.prevSolutionKey &&
      solKey === opts.prevSolutionKey &&
      attempt < Math.floor(innerAttempts * 0.65)
    ) {
      continue;
    }

    const strategies: Array<() => number[] | null> = [];
    if (lesson.technique === 'T4' || lesson.requirePigeonhole === 3) {
      strategies.push(() => pigeonholeRegions(size, solution, rand, 3, rand() < 0.5 ? 'col' : 'row'));
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, 'col'));
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
      strategies.push(() => easyRegions(size, solution, rand, Math.max(1, lesson.maxSingles)));
    } else if (lesson.requirePigeonhole === 2) {
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
      strategies.push(() => linePinRegions(size, solution, rand, 'col'));
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, rand() < 0.5 ? 'col' : 'row'));
      strategies.push(() => easyRegions(size, solution, rand, Math.max(1, lesson.maxSingles)));
    } else if (lesson.requireLinePin) {
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
      strategies.push(() => linePinRegions(size, solution, rand, 'col'));
    } else if (lesson.preferDualPairs) {
      strategies.push(() =>
        easyRegions(size, solution, rand, Math.max(1, Math.min(lesson.maxSingles, 2))),
      );
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
      strategies.push(() => dualPairRegions(size, solution, rand));
    } else if (lesson.technique === 'T0' || lesson.maxSingles > 0) {
      const s = Math.max(lesson.minSingles, Math.min(lesson.maxSingles, Math.floor(size / 2)));
      strategies.push(() => easyRegions(size, solution, rand, s));
      strategies.push(() => easyRegions(size, solution, rand, lesson.minSingles));
    } else if (lesson.technique === 'T6') {
      strategies.push(() => easyRegions(size, solution, rand, lesson.maxSingles));
      strategies.push(() => voronoiRegions(size, solution, rand));
    } else {
      strategies.push(() => easyRegions(size, solution, rand, lesson.maxSingles));
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

    const soft = lesson.preferDualPairs || lesson.technique === 'T5' || attempt > innerAttempts * 0.25;
    if (!matchesLesson(level, lesson, soft)) continue;

    const rating = rateLevel(level);
    const { stars, label } = starsForLesson(lesson, rating.stars);
    level.difficulty = lesson.technique === 'T0' ? Math.min(2, stars) : stars;
    level.difficultyLabel = lesson.technique === 'T0' ? '入门' : label;
    level.noGuess = rating.noGuess;
    level.technique = lesson.technique;
    level.techniqueLabel = TECHNIQUE_LABELS[lesson.technique];
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
      `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
      `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(file, null, 2)} as LevelsFile;\n`,
  );
}

function main(): void {
  const count = Number(process.env.LEVEL_COUNT ?? 500);
  const startId = Number(process.env.LEVEL_START ?? 1);
  const levels: LevelDefinition[] = [];
  let seed = 20261127 + startId * 7919;
  const t0 = Date.now();

  const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
  if (startId > 1 && existsSync(jsonPath)) {
    try {
      const prev = JSON.parse(readFileSync(jsonPath, 'utf8')) as { levels: LevelDefinition[] };
      for (const l of prev.levels) if (l.id < startId) levels.push(l);
      levels.sort((a, b) => a.id - b.id);
      console.log(`resuming from ${startId}, kept ${levels.length} prior levels`);
    } catch {
      /* ignore */
    }
  }

  const usedBoards = new Set<string>();
  const usedCanonical = new Set<string>();
  const usedSolutions = new Set<string>();
  let prevSolutionKey: string | null = null;
  let prevSize = -1;
  for (const l of levels) {
    usedBoards.add(boardFingerprint(l));
    usedCanonical.add(canonicalBoardFingerprint(l));
    usedSolutions.add(solutionFingerprint(l));
    prevSolutionKey = solutionFingerprint(l);
    prevSize = l.size;
  }

  for (let id = startId; id <= count; id++) {
    const lesson = curriculumFor(id);
    if (lesson.size !== prevSize) {
      usedSolutions.clear();
      prevSolutionKey = null;
      prevSize = lesson.size;
    }
    // Same-size stages can exhaust the solution pool (e.g. 6×6≈90 layouts).
    // Keep only a short recent window so boards stay varied without getting stuck.
    if (usedSolutions.size > 24) {
      usedSolutions.clear();
      if (prevSolutionKey) usedSolutions.add(prevSolutionKey);
    }

    let level: LevelDefinition | null = null;
    const maxRetry = lesson.size >= 8 ? 160 : lesson.size >= 7 ? 200 : lesson.requireNoGuess ? 320 : 220;
    for (let retry = 0; retry < maxRetry && !level; retry++) {
      // Late: soften dual-pair / pigeonhole-3 to related weaker structure
      let softLesson: Lesson = lesson;
      if (retry > maxRetry * 0.55 && lesson.requirePigeonhole === 3) {
        softLesson = { ...lesson, requirePigeonhole: 2, maxSingles: Math.max(lesson.maxSingles, 2) };
      } else if (retry > maxRetry * 0.5 && lesson.preferDualPairs) {
        softLesson = {
          ...lesson,
          preferDualPairs: false,
          requireLinePin: false,
          requireNoGuess: false,
          minSingles: 1,
          maxSingles: Math.max(3, lesson.maxSingles),
        };
      } else if (retry > maxRetry * 0.7 && lesson.technique === 'T6') {
        // Still require unique; allow a no-guess board only as last resort but keep T6 tag only if !noGuess
        softLesson = { ...lesson, maxSingles: Math.max(lesson.maxSingles, 2) };
      }
      if (retry > 0 && retry % 40 === 0) {
        console.log(`… still working level ${id} (${lesson.technique} ${lesson.size}x) retry=${retry}`);
      }
      level = generateOne(id, seed++, softLesson, {
        usedBoards,
        usedCanonical,
        usedSolutions,
        prevSolutionKey,
        strictNewSolution: lesson.size >= 7 && retry < maxRetry * 0.4,
      });
    }
    if (!level) {
      console.error(`Failed level ${id}`, curriculumFor(id));
      process.exit(1);
    }

    usedBoards.add(boardFingerprint(level));
    usedCanonical.add(canonicalBoardFingerprint(level));
    usedSolutions.add(solutionFingerprint(level));
    prevSolutionKey = solutionFingerprint(level);
    levels.push(level);

    if (id % 25 === 0 || id === count) {
      const byTech: Record<string, number> = {};
      for (const l of levels) {
        const t = l.technique ?? '?';
        byTech[t] = (byTech[t] ?? 0) + 1;
      }
      console.log(
        `generated ${id}/${count} · last=${level.size}x${level.size} ${level.technique} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        byTech,
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
    for (const id of [1, 2, 5, 30, 55, 110, 300]) {
      if (id < startId || id > count) continue;
      const l = levels.find((x) => x.id === id);
      const lesson = curriculumFor(id);
      if (!l || l.technique !== lesson.technique) {
        console.error(`Curriculum mismatch at ${id}`, l?.technique, lesson.technique);
        process.exit(1);
      }
    }
  }

  writePack(levels);

  const byTier: Record<string, number> = {};
  const bySize: Record<number, number> = {};
  const byTech: Record<string, number> = {};
  for (const l of levels) {
    byTier[l.difficultyLabel ?? '?'] = (byTier[l.difficultyLabel ?? '?'] ?? 0) + 1;
    bySize[l.size] = (bySize[l.size] ?? 0) + 1;
    byTech[l.technique ?? '?'] = (byTech[l.technique ?? '?'] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        total: levels.length,
        noGuess: levels.filter((l) => l.noGuess).length,
        byTech,
        byTier,
        bySize,
        elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
      },
      null,
      2,
    ),
  );
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) main();
