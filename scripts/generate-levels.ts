/**
 * Offline level generator — technique curriculum T0–T4 (gen v2).
 * Run: npm run generate:levels
 * Optional: LEVEL_COUNT=500 npm run generate:levels
 * Generates the full pack from level 1 (no KEEP_FIRST).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { verifyAllLevels } from '../assets/scripts/core/level/LevelQuality';
import { rateLevel } from '../assets/scripts/core/level/LevelDifficulty';
import {
  TECHNIQUE_LABELS,
  analyzeTechniques,
  coachGuideKeyForLevel,
  curriculumFor,
  type Lesson,
  type TechniqueId,
} from '../assets/scripts/core/level/LevelTechniques';
import {
  annotateLevel,
  buildHintFromAction,
  type FirstActionKind,
  type TechId,
} from '../assets/scripts/core/level/TechSolver';
import { singletonSolutionCats } from '../assets/scripts/core/level/TechniqueCoach';
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
export function linePinRegions(
  size: number,
  solution: number[],
  rand: () => number,
  along: 'row' | 'col',
  opts?: { preferLen?: 2 | 3; preferEdgeLine?: boolean },
): number[] | null {
  const preferLen = opts?.preferLen ?? (rand() < 0.55 ? 2 : 3);
  // Prefer an edge line for teach levels so the spotlight band is obvious.
  let rid = Math.floor(rand() * size);
  if (opts?.preferEdgeLine) {
    const edgeRids = solution
      .map((cell, i) => ({ i, cell }))
      .filter(({ cell }) => {
        const line = along === 'row' ? rowOf(cell, size) : colOf(cell, size);
        return line === 0 || line === size - 1;
      })
      .map((x) => x.i);
    if (edgeRids.length) rid = edgeRids[Math.floor(rand() * edgeRids.length)]!;
  }
  const seed = solution[rid]!;
  const sr = rowOf(seed, size);
  const sc = colOf(seed, size);
  const strip: number[] = [seed];
  const deltas = shuffle([-1, 1, -2, 2], rand);
  for (const d of deltas) {
    if (strip.length >= preferLen) break;
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
 * T3: k regions confined to k lines (pigeonhole).
 * Soft: other regions MAY own cells inside the band (T3 excludes those).
 * Hard confinement of pigeon regions outside the band is required for the structure.
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
  const pigeonSet = new Set(pigeonRids);
  const otherRids = Array.from({ length: size }, (_, i) => i).filter((r) => !pigeonSet.has(r));

  const regions = Array.from({ length: size * size }, () => -1);
  for (let i = 0; i < size; i++) regions[solution[i]!] = i;

  const inPigeonBand = (idx: number) => {
    const line = axis === 'col' ? colOf(idx, size) : rowOf(idx, size);
    return lineSet.has(line);
  };

  // Voronoi among all rids, but pigeon rids may only claim band cells.
  for (let idx = 0; idx < size * size; idx++) {
    if (regions[idx]! >= 0) continue;
    const r = rowOf(idx, size);
    const c = colOf(idx, size);
    const inBand = inPigeonBand(idx);
    let best: number[] = [];
    let bestD = 1e9;
    for (let rid = 0; rid < size; rid++) {
      if (pigeonSet.has(rid) && !inBand) continue;
      const s = solution[rid]!;
      const d = Math.abs(rowOf(s, size) - r) + Math.abs(colOf(s, size) - c);
      if (d < bestD) {
        bestD = d;
        best = [rid];
      } else if (d === bestD) best.push(rid);
    }
    if (!best.length) {
      if (!otherRids.length) return null;
      regions[idx] = otherRids[Math.floor(rand() * otherRids.length)]!;
    } else {
      regions[idx] = best[Math.floor(rand() * best.length)]!;
    }
  }

  // Enforce: pigeon regions cannot own cells outside the band.
  // Do NOT strip other regions from the band — those foreign cells are what T3 excludes.
  for (let idx = 0; idx < size * size; idx++) {
    const rid = regions[idx]!;
    if (pigeonSet.has(rid) && !inPigeonBand(idx)) {
      if (!otherRids.length) return null;
      regions[idx] = otherRids[Math.floor(rand() * otherRids.length)]!;
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

export function tryMakeUnique(
  size: number,
  solution: number[],
  regions: number[],
  rand: () => number,
  allowAssign?: (cell: number, rid: number) => boolean,
): number[] | null {
  let cur = [...regions];
  const s1 = new Set(solution);
  const timeoutMs = solveTimeoutMs(size);
  const maxAttempts = size >= 9 ? 48 : size >= 8 ? 56 : size >= 7 ? 64 : 50;
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

function techNum(technique: TechniqueId): 0 | 1 | 2 | 3 | 4 {
  return ({ T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as const)[technique];
}

function popcountLocal(mask: number): number {
  let n = 0;
  for (let t = mask; t; t >>= 1) n += t & 1;
  return n;
}

function sizeCoef(size: number): number {
  if (size <= 4) return 0;
  if (size === 5) return 1;
  if (size === 6) return 2;
  if (size === 7) return 3;
  if (size === 8) return 4;
  return 5; // 9+
}

/** Spec 7.4 difficulty: techCombo·10 + chain + branch·15 + sizeCoef. */
export function scoreDifficulty(level: LevelDefinition): number {
  const combo = level.techCombo?.length ?? 0;
  const chain = level.chainLength ?? 0;
  const branch = level.branchDepth ?? 0;
  return combo * 10 + chain + branch * 15 + sizeCoef(level.size);
}

function pickSingletonCat(level: LevelDefinition): number | null {
  const singles = singletonSolutionCats(level);
  if (singles.length) return singles[0]!;
  return level.solution?.[0] ?? null;
}

/** Annotate opts for curriculum gates — T1 lessons seed a singleton without clears. */
function annotateOptsForLesson(
  level: LevelDefinition,
  lesson: Lesson,
  initialCats?: number[],
): {
  t1Mode?: 'full' | 'a' | 'b';
  initialCats?: number[];
  allowedTechs: TechId[];
  pigeonK: 2;
} {
  const base = {
    allowedTechs: lesson.allowedTechs.slice() as TechId[],
    pigeonK: 2 as const,
  };
  if (lesson.technique !== 'T1') return base;
  const cat = initialCats?.[0] ?? pickSingletonCat(level);
  const t1Mode: 'full' | 'a' | 'b' =
    lesson.guideKey === 'T1a' ? 'a' : lesson.guideKey === 'T1b' ? 'b' : 'full';
  if (cat == null) return { ...base, t1Mode };
  return { ...base, t1Mode, initialCats: [cat] };
}

/**
 * Hard gates. Soft may only widen search seeds upstream — never relaxes
 * requiredTech === techNum(lesson.technique) or expands allowedTechs.
 */
function matchesLesson(
  level: LevelDefinition,
  lesson: Lesson,
  soft = false,
  initialCats?: number[],
): boolean {
  const flags = analyzeTechniques(level);
  const singles = flags.singletonCount;
  if (singles < lesson.minSingles || singles > lesson.maxSingles) return false;
  if (lesson.requireLinePin && !flags.hasLinePin) return false;
  // T3: require real pigeonhole-2 — do not accept line-pin alone.
  if (lesson.requirePigeonhole === 2) {
    if (!flags.hasPigeonhole2) return false;
  }
  if (lesson.requirePigeonhole === 3) {
    if (!(flags.hasPigeonhole3 || soft)) return false;
  }
  if (lesson.preferDualPairs) {
    if (!(flags.size2RegionCount >= 1 || flags.hasLinePin || flags.hasPigeonhole2 || soft)) {
      return false;
    }
  }

  const opts = annotateOptsForLesson(level, lesson, initialCats);
  const ann = annotateLevel(level, opts);
  if (!ann.solved) return false;

  // Strict: requiredTech must exactly equal the lesson technique number.
  if (ann.requiredTech !== techNum(lesson.technique)) return false;

  const allowed = new Set(lesson.allowedTechs);
  if (!ann.techCombo.every((t) => allowed.has(t))) return false;

  if (lesson.requireNoGuess && !ann.noGuess) return false;

  if (lesson.guideKey === 'T1a' && ann.firstAction?.kind !== 'T1a') return false;
  if (lesson.guideKey === 'T1b' && ann.firstAction?.kind !== 'T1b') return false;
  if (lesson.guideKey === 'T2' && ann.firstAction?.kind !== 'T2') return false;
  if (lesson.guideKey === 'T0' && ann.firstAction?.kind !== 'T0') return false;
  if (lesson.requireLinePin && lesson.maxSingles === 0 && ann.firstAction?.kind !== 'T2') {
    return false;
  }

  return true;
}

/** Softly grow tiny regions toward preferMinRegionArea (best-effort, never fails). */
function preferLargerRegions(
  size: number,
  solution: number[],
  regionsIn: number[],
  minArea: number,
  rand: () => number,
): number[] {
  const regions = [...regionsIn];
  const solSet = new Set(solution);
  for (let pass = 0; pass < size * 2; pass++) {
    const by: number[][] = Array.from({ length: size }, () => []);
    for (let i = 0; i < regions.length; i++) by[regions[i]!]!.push(i);
    let grew = false;
    for (let rid = 0; rid < size; rid++) {
      if (by[rid]!.length >= minArea) continue;
      const cells = shuffle(by[rid]!, rand);
      for (const cell of cells) {
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
          if (solSet.has(n)) continue;
          const other = regions[n]!;
          if (other === rid) continue;
          if (by[other]!.length <= minArea) continue;
          regions[n] = rid;
          grew = true;
          break;
        }
        if (grew) break;
      }
    }
    if (!grew) break;
  }
  return regionsAreFourConnected({ id: 1, size, regions }) ? regions : regionsIn;
}

function attachGuideHint(level: LevelDefinition, lesson: Lesson): void {
  if (!lesson.guide) return;
  level.guide = true;
  const guideKey = lesson.guideKey ?? coachGuideKeyForLevel(level.id);
  if (!guideKey) return;

  // L2/L4: pre-place one solution singleton; hint via annotate + initialCats.
  if (guideKey === 'T1a' || guideKey === 'T1b') {
    const cat = pickSingletonCat(level);
    if (cat == null) return;
    level.prePlaceCats = [cat];
    const t1Mode = guideKey === 'T1a' ? 'a' : 'b';
    const ann = annotateLevel(level, {
      t1Mode,
      initialCats: [cat],
      allowedTechs: lesson.allowedTechs.slice() as TechId[],
      pigeonK: 2,
    });
    if (ann.firstAction) {
      level.hint = buildHintFromAction(level, ann.firstAction, guideKey);
      return;
    }
    // Fallback: build exclude hint directly from the seeded cat.
    if (guideKey === 'T1b') {
      const neighbors = neighborIndexes(cat, level.size);
      level.hint = buildHintFromAction(
        level,
        {
          kind: 'T1b',
          placeCell: cat,
          excludeCells: neighbors,
          focusCells: [cat, ...neighbors],
          regionIds: [level.regions[cat]!],
        },
        'T1b',
      );
    } else {
      const size = level.size;
      const r = rowOf(cat, size);
      const c = colOf(cat, size);
      const exclude: number[] = [];
      for (let i = 0; i < size * size; i++) {
        if (i === cat) continue;
        if (rowOf(i, size) === r || colOf(i, size) === c) exclude.push(i);
      }
      level.hint = buildHintFromAction(
        level,
        {
          kind: 'T1a',
          placeCell: cat,
          excludeCells: exclude,
          focusCells: [cat, ...exclude],
          regionIds: [level.regions[cat]!],
          axis: 'row',
          line: r,
        },
        'T1a',
      );
    }
    return;
  }

  const ann = annotateLevel(level, {
    allowedTechs: lesson.allowedTechs.slice() as TechId[],
    pigeonK: 2,
  });
  if (!ann.firstAction) return;
  const kind: FirstActionKind = ann.firstAction.kind as FirstActionKind;
  level.hint = buildHintFromAction(level, ann.firstAction, kind);
}

function starsForLesson(lesson: Lesson, ratingStars: number): { stars: number; label: string } {
  const base: Record<TechniqueId, number> = {
    T0: 1,
    T1: 2,
    T2: 3,
    T3: 4,
    T4: 7,
  };
  let stars = Math.max(base[lesson.technique], Math.min(10, ratingStars));
  if (lesson.size >= 9) stars = Math.min(10, stars + 1);
  if (lesson.technique === 'T4') stars = Math.max(6, stars);
  const label =
    stars <= 2 ? '入门' : stars <= 3 ? '简单' : stars <= 5 ? '普通' : stars <= 6 ? '进阶' : stars <= 8 ? '困难' : '专家';
  return { stars, label };
}

export function generateOne(
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
  const innerAttempts = size >= 9 ? 48 : size >= 8 ? 64 : size >= 7 ? 80 : 90;

  for (let attempt = 0; attempt < innerAttempts; attempt++) {
    const rand = mulberry32((seed + attempt * 0x9e3779b9 + id * 0x85ebca6b) >>> 0);
    const solution = placeSolution(size, rand);
    if (!solution) continue;
    const solKey = `${size}|${[...solution].sort((a, b) => a - b).join(',')}`;
    // Always avoid known solutions when the pool tracks them (early same-size
    // alternation + large-board strict mode).
    if (opts.usedSolutions.has(solKey)) continue;
    if (
      opts.prevSolutionKey &&
      solKey === opts.prevSolutionKey &&
      attempt < Math.floor(innerAttempts * 0.65)
    ) {
      continue;
    }

    const strategies: Array<() => number[] | null> = [];
    let allowAssign: ((cell: number, rid: number) => boolean) | undefined;
    if (lesson.technique === 'T3' || lesson.requirePigeonhole === 2) {
      // T3: only pigeonhole k=2 (never k=3).
      const axisHint: 'row' | 'col' = attempt % 2 === 0 ? 'col' : 'row';
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, 'col'));
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, 'row'));
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, axisHint));
      strategies.push(() => pigeonholeRegions(size, solution, rand, 2, rand() < 0.5 ? 'col' : 'row'));
    } else if (lesson.requireLinePin || lesson.technique === 'T2') {
      const teachPin = lesson.mode === 'teach';
      const pinOpts = teachPin
        ? ({ preferLen: 2 as const, preferEdgeLine: true } as const)
        : undefined;
      strategies.push(() => linePinRegions(size, solution, rand, 'row', pinOpts));
      strategies.push(() => linePinRegions(size, solution, rand, 'col', pinOpts));
      strategies.push(() => linePinRegions(size, solution, rand, 'row', { preferLen: 2 }));
      strategies.push(() => linePinRegions(size, solution, rand, 'col', { preferLen: 2 }));
      // Large boards: widen seeds (uniqueness); requiredTech===2 gate stays strict.
      if (size >= 7) {
        strategies.push(() => pigeonholeRegions(size, solution, rand, 2, 'row'));
        strategies.push(() => pigeonholeRegions(size, solution, rand, 2, 'col'));
        strategies.push(() => easyRegions(size, solution, rand, Math.max(0, lesson.maxSingles)));
        strategies.push(() => voronoiRegions(size, solution, rand));
      }
    } else if (lesson.technique === 'T4') {
      strategies.push(() => easyRegions(size, solution, rand, lesson.maxSingles));
      strategies.push(() => voronoiRegions(size, solution, rand));
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
    } else if (lesson.technique === 'T0' || lesson.maxSingles > 0) {
      const s = Math.max(lesson.minSingles, Math.min(lesson.maxSingles, Math.floor(size / 2)));
      strategies.push(() => easyRegions(size, solution, rand, s));
      strategies.push(() => easyRegions(size, solution, rand, lesson.minSingles));
    } else {
      // T1: few/no singles, forced exclude chains
      strategies.push(() => easyRegions(size, solution, rand, lesson.maxSingles));
      strategies.push(() => voronoiRegions(size, solution, rand));
      strategies.push(() => linePinRegions(size, solution, rand, 'row'));
    }

    const pick = strategies[attempt % strategies.length]!;
    let regions = pick();
    if (!regions) continue;
    if (lesson.preferMinRegionArea && id >= 8) {
      regions = preferLargerRegions(size, solution, regions, lesson.preferMinRegionArea, rand);
    }
    // For T3: preserve pigeonhole confinement during uniqueness repair —
    // a pigeon rid (solution cat on a 2-line band that already forms PH) must
    // not gain cells outside the lines its open cells currently occupy.
    if (lesson.technique === 'T3' || lesson.requirePigeonhole === 2) {
      const flags = analyzeTechniques({
        id: 1,
        size,
        regions,
        solution: [...solution].sort((a, b) => a - b),
      });
      if (flags.hasPigeonhole2) {
        // Detect axis + band from current regions via solution cats of size-2 PH.
        // Fallback: allow any assign (structure rechecked after).
        allowAssign = (cell: number, rid: number) => {
          const seed = solution[rid]!;
          const cellR = rowOf(cell, size);
          const cellC = colOf(cell, size);
          const seedR = rowOf(seed, size);
          const seedC = colOf(seed, size);
          // Heuristic: if rid's current cells are confined to ≤2 rows or ≤2 cols,
          // new cell must stay inside that bounding band.
          let rowMask = 0;
          let colMask = 0;
          for (let i = 0; i < regions!.length; i++) {
            if (regions![i] !== rid) continue;
            rowMask |= 1 << rowOf(i, size);
            colMask |= 1 << colOf(i, size);
          }
          const rowBits = popcountLocal(rowMask);
          const colBits = popcountLocal(colMask);
          if (rowBits > 0 && rowBits <= 2 && !((rowMask >> cellR) & 1) && rowBits === 2) {
            return false;
          }
          if (colBits > 0 && colBits <= 2 && !((colMask >> cellC) & 1) && colBits === 2) {
            return false;
          }
          void seedR;
          void seedC;
          return true;
        };
      }
    }
    regions = tryMakeUnique(size, solution, regions, rand, allowAssign);
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

    // Soft only widens structural seed acceptance — never requiredTech equality.
    const soft = attempt > innerAttempts * 0.35;
    const annOpts = annotateOptsForLesson(level, lesson);
    const initialCats = annOpts?.initialCats;
    if (!matchesLesson(level, lesson, soft, initialCats)) continue;

    const ann = annotateLevel(level, annOpts);
    const rating = rateLevel(level);
    const { stars, label } = starsForLesson(lesson, rating.stars);
    level.difficulty = lesson.technique === 'T0' ? Math.min(2, stars) : stars;
    level.difficultyLabel = lesson.technique === 'T0' ? '入门' : label;
    level.noGuess = ann.noGuess;
    level.technique = lesson.technique;
    level.techniqueLabel = TECHNIQUE_LABELS[lesson.technique];
    level.elite = id >= 100 && id % 25 === 0;
    level.stage = lesson.stage;
    level.requiredTech = ann.requiredTech;
    level.techCombo = ann.techCombo.slice();
    level.chainLength = ann.chainLength;
    level.branchDepth = ann.branchDepth;
    if (lesson.pure) level.pure = true;
    attachGuideHint(level, lesson);
    return level;
  }
  return null;
}

interface StageMonoInfo {
  name: string;
  firstId: number;
  lastId: number;
  firstDiff: number;
  lastDiff: number;
  monoPass: boolean;
  exceptions: string[];
}

function writeStats(levels: LevelDefinition[], mono: StageMonoInfo[] = []): void {
  const byTech: Record<string, number> = {};
  const byStage: Record<string, number> = {};
  const bySize: Record<number, number> = {};
  const byRequired: Record<string, number> = {};
  let guides = 0;
  let pure = 0;
  let noGuess = 0;
  for (const l of levels) {
    byTech[l.technique ?? '?'] = (byTech[l.technique ?? '?'] ?? 0) + 1;
    byStage[l.stage ?? '?'] = (byStage[l.stage ?? '?'] ?? 0) + 1;
    bySize[l.size] = (bySize[l.size] ?? 0) + 1;
    byRequired[String(l.requiredTech ?? '?')] = (byRequired[String(l.requiredTech ?? '?')] ?? 0) + 1;
    if (l.guide) guides += 1;
    if (l.pure) pure += 1;
    if (l.noGuess) noGuess += 1;
  }
  const lines = [
    '# Cat Queens · level pack stats (gen v2)',
    '',
    `- total: ${levels.length}`,
    `- noGuess: ${noGuess}`,
    `- guides: ${guides}`,
    `- pure: ${pure}`,
    '',
    '## by technique',
    ...Object.entries(byTech).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## by requiredTech',
    ...Object.entries(byRequired).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## by stage',
    ...Object.entries(byStage).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## by size',
    ...Object.entries(bySize).map(([k, v]) => `- ${k}×${k}: ${v}`),
    '',
    '## stage difficulty monotonicity (7.4)',
    ...mono.map((m) => {
      const ex = m.exceptions.length ? `; exceptions: ${m.exceptions.join(', ')}` : '';
      return `- ${m.name} L${m.firstId}–${m.lastId}: first=${m.firstDiff} last=${m.lastDiff} mono=${m.monoPass ? 'pass' : 'fail'}${ex}`;
    }),
    '',
  ];
  const path = join(ROOT, 'assets/resources/data/stats.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n'));
}

function writePack(levels: LevelDefinition[], mono: StageMonoInfo[] = []): void {
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
  writeStats(levels, mono);
}

/** Stage ranges and target difficulty bands (spec 7.4). */
const STAGES: Array<{
  name: string;
  first: number;
  last: number;
  band: [number, number];
}> = [
  { name: '入门', first: 1, last: 7, band: [10, 20] },
  { name: '基础', first: 8, last: 15, band: [25, 40] },
  { name: '进阶', first: 16, last: 50, band: [45, 60] },
  { name: '高级A', first: 51, last: 120, band: [70, 90] },
  { name: '高级B', first: 121, last: 250, band: [80, 110] },
  { name: '大师', first: 251, last: 400, band: [90, 115] },
  { name: '终局', first: 401, last: 500, band: [115, 999] },
];

/** Stage-first ids that may dip vs previous stage (incl. guides). */
const STAGE_FIRST_DIP_IDS = new Set([8, 16, 51, 121, 251, 401]);

function generateCandidate(
  targetId: number,
  lesson: Lesson,
  seed: { value: number },
  pools: {
    usedBoards: Set<string>;
    usedCanonical: Set<string>;
    usedSolutions: Set<string>;
    prevSolutionKey: string | null;
  },
): LevelDefinition | null {
  const maxRetry =
    lesson.size >= 9
      ? 400
      : lesson.size >= 8
        ? 420
        : lesson.size >= 7
          ? 480
          : lesson.requireNoGuess
            ? 360
            : 240;

  for (let retry = 0; retry < maxRetry; retry++) {
    // Soft may only widen search seeds / structure — never expand allowedTechs
    // or relax requiredTech equality (matchesLesson still enforces both).
    let softLesson: Lesson = { ...lesson, allowedTechs: lesson.allowedTechs.slice() };
    if (retry > maxRetry * 0.5 && lesson.preferDualPairs) {
      softLesson = {
        ...softLesson,
        preferDualPairs: false,
        maxSingles: Math.max(3, lesson.maxSingles),
      };
    } else if (retry > maxRetry * 0.25 && lesson.size >= 7 && lesson.requireLinePin) {
      // Keep requiredTech===2; drop static line-pin flag so emergent T2 can match.
      softLesson = {
        ...softLesson,
        requireLinePin: false,
        maxSingles: Math.max(2, lesson.maxSingles),
      };
    } else if (retry > maxRetry * 0.5 && lesson.technique === 'T4') {
      softLesson = { ...softLesson, maxSingles: Math.max(lesson.maxSingles, 2) };
    }
    // Never soft-drop requirePigeonhole / expand allowedTechs.
    // Large mix stages: curriculum already sets requireNoGuess false when needed.
    if (retry > 0 && retry % 50 === 0) {
      console.log(
        `… still working candidate for id~${targetId} (${lesson.technique} ${lesson.size}x) retry=${retry}`,
      );
    }
    const level = generateOne(targetId, seed.value++, softLesson, {
      usedBoards: pools.usedBoards,
      usedCanonical: pools.usedCanonical,
      usedSolutions: pools.usedSolutions,
      prevSolutionKey: pools.prevSolutionKey,
      strictNewSolution: lesson.size >= 7 && retry < maxRetry * 0.4,
    });
    if (level) return level;
  }
  return null;
}

function finalizeLevelMeta(level: LevelDefinition, id: number): void {
  const lesson = curriculumFor(id);
  level.id = id;
  level.chapterId = Math.ceil(id / 50);
  level.elite = id >= 100 && id % 25 === 0;
  level.stage = lesson.stage;
  level.technique = lesson.technique;
  level.techniqueLabel = TECHNIQUE_LABELS[lesson.technique];
  if (lesson.pure) level.pure = true;
  else delete level.pure;
  if (lesson.guide) {
    attachGuideHint(level, lesson);
  } else {
    delete level.guide;
    delete level.hint;
    delete level.prePlaceCats;
  }
}

function lessonCompatible(level: LevelDefinition, lesson: Lesson): boolean {
  if (level.size !== lesson.size) return false;
  if (level.technique !== lesson.technique) return false;
  if (level.requiredTech !== techNum(lesson.technique)) return false;
  return true;
}

/**
 * Assign candidates to stage ids: pinned guides stay fixed; flex picks
 * easiest remaining board compatible with each id's curriculum; then
 * check monotonicity (review/guide/stage-first exceptions).
 */
function assignStageLevels(
  ids: number[],
  pinned: Map<number, LevelDefinition>,
  pool: LevelDefinition[],
): { levels: LevelDefinition[]; exceptions: string[]; pass: boolean } {
  const remaining = [...pool].sort((a, b) => scoreDifficulty(a) - scoreDifficulty(b));
  const assigned: LevelDefinition[] = [];
  const exceptions: string[] = [];
  let prevDiff = -Infinity;

  for (const id of ids) {
    if (pinned.has(id)) {
      const level = pinned.get(id)!;
      finalizeLevelMeta(level, id);
      assigned.push(level);
      prevDiff = scoreDifficulty(level);
      continue;
    }
    const lesson = curriculumFor(id);
    const compat = (l: LevelDefinition) =>
      lessonCompatible(l, lesson) ||
      (l.size === lesson.size && l.requiredTech === techNum(lesson.technique));

    // Prefer smallest difficulty that still respects monotonicity vs prev.
    let pickIdx = remaining.findIndex((l) => compat(l) && scoreDifficulty(l) >= prevDiff);
    if (pickIdx < 0) pickIdx = remaining.findIndex((l) => compat(l));
    if (pickIdx < 0) {
      throw new Error(`No compatible candidate for L${id} (${lesson.technique} ${lesson.size}x)`);
    }
    const [level] = remaining.splice(pickIdx, 1)!;
    finalizeLevelMeta(level!, id);
    assigned.push(level!);
    prevDiff = scoreDifficulty(level!);
  }

  prevDiff = -Infinity;
  let pass = true;
  for (let idx = 0; idx < assigned.length; idx++) {
    const id = ids[idx]!;
    const diff = scoreDifficulty(assigned[idx]!);
    if (diff < prevDiff && Number.isFinite(prevDiff)) {
      const dip = prevDiff - diff;
      const isReview = id % 10 === 0;
      const isStageFirst = STAGE_FIRST_DIP_IDS.has(id);
      const isGuide = curriculumFor(id).guide === true;
      const prevIsGuide = idx > 0 && curriculumFor(ids[idx - 1]!).guide === true;
      if (isStageFirst || isGuide) {
        exceptions.push(`L${id} guide/stage-first dip ${dip}`);
      } else if (prevIsGuide && dip <= 10) {
        exceptions.push(`L${id} post-guide dip ${dip}`);
      } else if (isReview && dip <= 10) {
        exceptions.push(`L${id} review dip ${dip}`);
      } else {
        exceptions.push(`L${id} mono fail dip ${dip}`);
        pass = false;
      }
    }
    prevDiff = diff;
  }

  return { levels: assigned, exceptions, pass };
}

function main(): void {
  const count = Number(process.env.LEVEL_COUNT ?? 500);
  const t0 = Date.now();
  let seed = { value: 20261127 + Math.floor(Date.now() / 1000) % 100000 };

  const usedBoards = new Set<string>();
  const usedCanonical = new Set<string>();
  const usedSolutions = new Set<string>();
  let prevSolutionKey: string | null = null;
  let prevSize = -1;

  const allLevels: LevelDefinition[] = [];
  const monoInfos: StageMonoInfo[] = [];

  // Resume: keep completed stages already written to levels.json.
  const resumeFrom = Number(process.env.LEVEL_RESUME ?? 0);
  if (resumeFrom > 1 && existsSync(join(ROOT, 'assets/resources/data/levels.json'))) {
    try {
      const prev = JSON.parse(
        readFileSync(join(ROOT, 'assets/resources/data/levels.json'), 'utf8'),
      ) as { levels: LevelDefinition[] };
      for (const l of prev.levels) {
        if (l.id >= resumeFrom) continue;
        allLevels.push(l);
        usedBoards.add(boardFingerprint(l));
        usedCanonical.add(canonicalBoardFingerprint(l));
        usedSolutions.add(solutionFingerprint(l));
        prevSolutionKey = solutionFingerprint(l);
        prevSize = l.size;
      }
      allLevels.sort((a, b) => a.id - b.id);
      console.log(`resuming from L${resumeFrom}, kept ${allLevels.length} levels`);
    } catch (err) {
      console.warn('resume failed, starting fresh', err);
    }
  }

  for (const stage of STAGES) {
    if (stage.first > count) break;
    if (resumeFrom > 1 && stage.last < resumeFrom) continue;
    const stageLast = Math.min(stage.last, count);
    if (resumeFrom > 1 && stage.first < resumeFrom && stageLast >= resumeFrom) {
      // Partial stage resume not supported — restart this stage from its first id.
    }
    if (resumeFrom > 1 && stage.first < resumeFrom) continue;
    const ids = Array.from({ length: stageLast - stage.first + 1 }, (_, i) => stage.first + i);
    const need = ids.length;
    const targetCandidates = Math.ceil(need * 1.5);

    // Pin guide / stage-first curriculum ids — generate those with exact lesson first.
    const pinnedIds = ids.filter(
      (id) => curriculumFor(id).guide || STAGE_FIRST_DIP_IDS.has(id) || id === 1 || id === 2 || id === 4,
    );
    const pinned: Map<number, LevelDefinition> = new Map();

    console.log(
      `\n=== stage ${stage.name} L${stage.first}–${stageLast} · need ${need} · candidates ~${targetCandidates} ===`,
    );

    for (const id of pinnedIds) {
      if (id > count) continue;
      const lesson = curriculumFor(id);
      if (lesson.size !== prevSize) {
        usedSolutions.clear();
        prevSolutionKey = null;
        prevSize = lesson.size;
      }
      if (usedSolutions.size > 24) {
        usedSolutions.clear();
        if (prevSolutionKey) usedSolutions.add(prevSolutionKey);
      }
      // Stage-first / guides: sample a few candidates and prefer near band floor
      // so later flex levels can still ascend within the stage.
      const samples: LevelDefinition[] = [];
      // Restricted-aux stages (高级B) and large T3 are expensive to sample.
      const sampleN =
        STAGE_FIRST_DIP_IDS.has(id) || lesson.guide
          ? lesson.size >= 8
            ? 2
            : lesson.technique === 'T3' && lesson.allowedTechs.length <= 3
              ? 2
              : lesson.size >= 7
                ? 3
                : 6
          : 1;
      for (let s = 0; s < sampleN; s++) {
        const level = generateCandidate(id, lesson, seed, {
          usedBoards,
          usedCanonical,
          usedSolutions,
          prevSolutionKey,
        });
        if (!level) break;
        samples.push(level);
        // Tentatively mark fingerprints so samples don't collide with each other.
        usedBoards.add(boardFingerprint(level));
        usedCanonical.add(canonicalBoardFingerprint(level));
        usedSolutions.add(solutionFingerprint(level));
        prevSolutionKey = solutionFingerprint(level);
      }
      if (!samples.length) {
        console.error(`Failed pinned level ${id}`, lesson);
        process.exit(1);
      }
      const [bandLo] = stage.band;
      samples.sort((a, b) => {
        const da = Math.abs(scoreDifficulty(a) - bandLo);
        const db = Math.abs(scoreDifficulty(b) - bandLo);
        if (da !== db) return da - db;
        return scoreDifficulty(a) - scoreDifficulty(b);
      });
      const level = samples[0]!;
      // Unused samples stay in used* sets (dedupe) — acceptable loss.
      pinned.set(id, level);
      console.log(
        `  pinned L${id} ${level.size}x ${level.technique} req=${level.requiredTech} diff=${scoreDifficulty(level)} (from ${samples.length} samples)`,
      );
    }

    // Generate ~1.5× candidates cycling curriculumFor across flex ids.
    const pool: LevelDefinition[] = [];
    const flexIds = ids.filter((id) => !pinned.has(id));
    // Spec: ~1.5× candidates. Early short stages get a bit more headroom for mono.
    const flexNeed = Math.max(
      targetCandidates - pinned.size,
      need <= 15 ? flexIds.length * 2 : flexIds.length,
    );
    let guard = flexNeed * 12 + 100;
    let cycle = 0;
    while (pool.length < flexNeed && guard-- > 0) {
      const idHint = flexIds.length ? flexIds[cycle % flexIds.length]! : ids[cycle % ids.length]!;
      cycle++;
      const lesson = curriculumFor(idHint);
      if (lesson.size !== prevSize) {
        usedSolutions.clear();
        prevSolutionKey = null;
        prevSize = lesson.size;
      }
      if (usedSolutions.size > 24) {
        usedSolutions.clear();
        if (prevSolutionKey) usedSolutions.add(prevSolutionKey);
      }
      const level = generateCandidate(idHint, lesson, seed, {
        usedBoards,
        usedCanonical,
        usedSolutions,
        prevSolutionKey,
      });
      if (!level) continue;
      usedBoards.add(boardFingerprint(level));
      usedCanonical.add(canonicalBoardFingerprint(level));
      usedSolutions.add(solutionFingerprint(level));
      prevSolutionKey = solutionFingerprint(level);
      pool.push(level);
      if (pool.length % 10 === 0) {
        console.log(
          `  pool ${pool.length}/${flexNeed} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
      }
    }

    // Prefer candidates inside the stage difficulty band when enough remain.
    const [bandLo, bandHi] = stage.band;
    const inBand = pool.filter((l) => {
      const d = scoreDifficulty(l);
      return d >= bandLo && d <= bandHi;
    });
    const poolForAssign =
      inBand.length >= flexIds.length ? inBand : pool;

    // Ensure every flex id has at least one compatible board; generate more if needed.
    for (const id of flexIds) {
      const lesson = curriculumFor(id);
      const has = poolForAssign.some((l) => lessonCompatible(l, lesson));
      if (has) continue;
      const level = generateCandidate(id, lesson, seed, {
        usedBoards,
        usedCanonical,
        usedSolutions,
        prevSolutionKey,
      });
      if (!level) {
        console.error(`Failed to fill stage ${stage.name} slot`, id, lesson);
        process.exit(1);
      }
      usedBoards.add(boardFingerprint(level));
      usedCanonical.add(canonicalBoardFingerprint(level));
      usedSolutions.add(solutionFingerprint(level));
      prevSolutionKey = solutionFingerprint(level);
      poolForAssign.push(level);
      pool.push(level);
    }

    let stageLevels: LevelDefinition[];
    let exceptions: string[];
    let pass: boolean;
    try {
      ({ levels: stageLevels, exceptions, pass } = assignStageLevels(ids, pinned, poolForAssign));
    } catch (err) {
      console.error(err);
      process.exit(1);
    }

    // Repair mono fails by regenerating harder boards for dipping flex slots.
    for (let repair = 0; repair < 40; repair++) {
      let repaired = false;
      for (let idx = 1; idx < stageLevels.length; idx++) {
        const id = ids[idx]!;
        if (pinned.has(id)) continue;
        const prev = scoreDifficulty(stageLevels[idx - 1]!);
        const cur = scoreDifficulty(stageLevels[idx]!);
        if (cur >= prev) continue;
        const lesson = curriculumFor(id);
        const replacement = generateCandidate(id, lesson, seed, {
          usedBoards,
          usedCanonical,
          usedSolutions,
          prevSolutionKey,
        });
        if (!replacement) continue;
        if (scoreDifficulty(replacement) < prev) continue;
        usedBoards.add(boardFingerprint(replacement));
        usedCanonical.add(canonicalBoardFingerprint(replacement));
        usedSolutions.add(solutionFingerprint(replacement));
        prevSolutionKey = solutionFingerprint(replacement);
        finalizeLevelMeta(replacement, id);
        stageLevels[idx] = replacement;
        repaired = true;
      }
      if (!repaired) break;
    }

    // Recompute mono status after repairs.
    {
      exceptions = [];
      pass = true;
      let prevD = -Infinity;
      for (let idx = 0; idx < stageLevels.length; idx++) {
        const id = ids[idx]!;
        const diff = scoreDifficulty(stageLevels[idx]!);
        if (diff < prevD && Number.isFinite(prevD)) {
          const dip = prevD - diff;
          const isReview = id % 10 === 0;
          const isStageFirst = STAGE_FIRST_DIP_IDS.has(id);
          const isGuide = curriculumFor(id).guide === true;
          if (isStageFirst || isGuide) exceptions.push(`L${id} guide/stage-first dip ${dip}`);
          else if (isReview && dip <= 10) exceptions.push(`L${id} review dip ${dip}`);
          else {
            exceptions.push(`L${id} mono fail dip ${dip}`);
            pass = false;
          }
        }
        prevD = diff;
      }
    }

    const firstDiff = scoreDifficulty(stageLevels[0]!);
    const lastDiff = scoreDifficulty(stageLevels[stageLevels.length - 1]!);
    monoInfos.push({
      name: stage.name,
      firstId: stage.first,
      lastId: stageLast,
      firstDiff,
      lastDiff,
      monoPass: pass,
      exceptions,
    });

    for (const l of stageLevels) allLevels.push(l);

    console.log(
      `  stage done · firstDiff=${firstDiff} lastDiff=${lastDiff} mono=${pass ? 'pass' : 'fail'} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    writePack(allLevels, monoInfos);
  }

  const quality = verifyAllLevels(allLevels, Math.max(5000, solveTimeoutMs(10) + 1000));
  if (quality.fail.length) {
    console.error('Quality gate failed', quality.fail.slice(0, 20));
    process.exit(1);
  }

  const seenBoard = new Set<string>();
  const seenCanon = new Set<string>();
  for (const l of allLevels) {
    const b = boardFingerprint(l);
    const c = canonicalBoardFingerprint(l);
    if (seenBoard.has(b) || seenCanon.has(c)) {
      console.error(`Duplicate board at level ${l.id}`);
      process.exit(1);
    }
    seenBoard.add(b);
    seenCanon.add(c);
  }

  for (const id of [1, 2, 4, 8, 16, 51]) {
    if (id > count) continue;
    const l = allLevels.find((x) => x.id === id);
    const lesson = curriculumFor(id);
    if (!l || l.technique !== lesson.technique) {
      console.error(`Curriculum mismatch at ${id}`, l?.technique, lesson.technique);
      process.exit(1);
    }
    if (l.requiredTech !== techNum(lesson.technique)) {
      console.error(`L${id} requiredTech expected ${techNum(lesson.technique)}, got ${l.requiredTech}`);
      process.exit(1);
    }
  }
  if (count >= 1) {
    const l1 = allLevels.find((x) => x.id === 1)!;
    if (l1.hint?.crossOutCells?.length) {
      /* T0 is PLACE — crossOut optional */
    }
    if (l1.requiredTech !== 0) {
      console.error('L1 requiredTech expected 0');
      process.exit(1);
    }
  }
  if (count >= 2) {
    const l2 = allLevels.find((x) => x.id === 2)!;
    if (!l2.prePlaceCats?.length || l2.hint?.crossOutCells?.length === 0) {
      console.error('L2 expected T1a EXCLUDE + prePlaceCats', l2.prePlaceCats, l2.hint);
      process.exit(1);
    }
  }
  if (count >= 4) {
    const l4 = allLevels.find((x) => x.id === 4)!;
    if (!l4.prePlaceCats?.length || l4.hint?.crossOutCells?.length === 0) {
      console.error('L4 expected T1b EXCLUDE + prePlaceCats', l4.prePlaceCats, l4.hint);
      process.exit(1);
    }
  }

  writePack(allLevels, monoInfos);

  // Post-check: every level must solve under lesson.allowedTechs with exact primary.
  const bad: Array<{ id: number; reason: string }> = [];
  for (const l of allLevels) {
    const lesson = curriculumFor(l.id);
    const opts = annotateOptsForLesson(l, lesson, l.prePlaceCats);
    const ann = annotateLevel(l, opts);
    if (!ann.solved) {
      bad.push({ id: l.id, reason: 'unsolved under allowedTechs' });
      continue;
    }
    if (ann.requiredTech !== techNum(lesson.technique)) {
      bad.push({
        id: l.id,
        reason: `requiredTech ${ann.requiredTech} !== primary ${techNum(lesson.technique)}`,
      });
      continue;
    }
    const allowed = new Set(lesson.allowedTechs);
    const outside = ann.techCombo.filter((t) => !allowed.has(t));
    if (outside.length) {
      bad.push({ id: l.id, reason: `techCombo outside allowed: ${outside.join(',')}` });
    }
  }
  if (bad.length) {
    console.error(`Post-check failed: ${bad.length} bad levels`, bad.slice(0, 30));
    process.exit(1);
  }
  console.log(`Post-check ok: bad-count=0 / ${allLevels.length}`);

  const byTier: Record<string, number> = {};
  const bySize: Record<number, number> = {};
  const byTech: Record<string, number> = {};
  for (const l of allLevels) {
    byTier[l.difficultyLabel ?? '?'] = (byTier[l.difficultyLabel ?? '?'] ?? 0) + 1;
    bySize[l.size] = (bySize[l.size] ?? 0) + 1;
    byTech[l.technique ?? '?'] = (byTech[l.technique ?? '?'] ?? 0) + 1;
  }
  console.log(
    JSON.stringify(
      {
        total: allLevels.length,
        badCount: 0,
        noGuess: allLevels.filter((l) => l.noGuess).length,
        byTech,
        byTier,
        bySize,
        mono: monoInfos,
        elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
      },
      null,
      2,
    ),
  );
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) main();
