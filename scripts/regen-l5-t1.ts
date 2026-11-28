/**
 * Remake level 5: T1 line-pin exclude must unlock the first cat (no free singleton).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculumFor } from '../assets/scripts/core/level/LevelTechniques';
import {
  findBestLinePinExclude,
  findLevelCoachPlan,
} from '../assets/scripts/core/level/TechniqueCoach';
import {
  level5NeedsT1ForFirstCat,
  regionOpenSingletons,
} from '../assets/scripts/core/level/OnboardingChain';
import { puzzleSolver } from '../assets/scripts/core/puzzle/PuzzleSolver';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { generateOne } from './generate-levels';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');

const pack = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
  schemaVersion: number;
  levels: LevelDefinition[];
};

const usedBoards = new Set<string>();
const usedCanonical = new Set<string>();
const usedSolutions = new Set<string>();
for (const l of pack.levels) {
  if (l.id === 5) continue;
  usedBoards.add(`${l.size}|R:${l.regions.join(',')}|S:${l.solution!.join(',')}`);
  const map = new Map<number, number>();
  let next = 0;
  const canon = l.regions.map((rid) => {
    let m = map.get(rid);
    if (m === undefined) {
      m = next++;
      map.set(rid, m);
    }
    return m;
  });
  usedCanonical.add(
    `${l.size}|R:${canon.join(',')}|S:${[...l.solution!].sort((a, b) => a - b).join(',')}`,
  );
  usedSolutions.add(`${l.size}|${[...l.solution!].sort((a, b) => a - b).join(',')}`);
}

const lesson = curriculumFor(5);
let best: LevelDefinition | null = null;
let bestScore = -1;
let seed = 20261129 * 5;
const maxRetry = 8000;

for (let retry = 0; retry < maxRetry; retry++) {
  if (retry > 0 && retry % 400 === 0) {
    console.log(`… L5 retry=${retry} best=${bestScore}`);
  }
  const level = generateOne(5, seed++, lesson, {
    usedBoards,
    usedCanonical,
    usedSolutions,
    prevSolutionKey: null,
    strictNewSolution: false,
  });
  if (!level) continue;

  const unique = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 2500 });
  if (unique.status !== 'ONE') continue;
  if (!level5NeedsT1ForFirstCat(level)) continue;

  const demo = findBestLinePinExclude(level)!;
  const unlocked = regionOpenSingletons(level, [], new Set(demo.excludeCells));
  const score =
    100 +
    demo.excludeCells.length * 15 +
    (demo.regionSize === 2 ? 40 : 10) +
    unlocked.length * 20;
  if (score > bestScore) {
    bestScore = score;
    best = level;
    console.log('L5 candidate', {
      retry,
      score,
      regionId: demo.regionId,
      axis: demo.axis,
      excludes: demo.excludeCells.length,
      unlocked,
    });
    if (score >= 220) break;
  }
}

if (!best) {
  console.error('Failed L5 T1-first search');
  process.exit(1);
}

pack.levels[pack.levels.findIndex((l) => l.id === 5)] = best;
console.log('SELECTED L5', {
  score: bestScore,
  plan: findLevelCoachPlan(best),
  demo: findBestLinePinExclude(best),
  needsT1: level5NeedsT1ForFirstCat(best),
  unlocked: regionOpenSingletons(
    best,
    [],
    new Set(findBestLinePinExclude(best)!.excludeCells),
  ),
});

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote L5');
