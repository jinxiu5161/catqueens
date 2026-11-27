/**
 * Remake level 29: T2 pigeonhole must unlock the first cat (no free singleton).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculumFor } from '../assets/scripts/core/level/LevelTechniques';
import {
  findBestPigeonExclude,
  findCoachLesson,
  findLevelCoachPlan,
} from '../assets/scripts/core/level/TechniqueCoach';
import { level29NeedsT2ForFirstCat } from '../assets/scripts/core/level/OnboardingChain';
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
  if (l.id === 29) continue;
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

const lesson = curriculumFor(29);
let best: LevelDefinition | null = null;
let bestScore = -1;
let seed = 20261129 * 29;
const maxRetry = 6000;

for (let retry = 0; retry < maxRetry; retry++) {
  if (retry > 0 && retry % 300 === 0) {
    console.log(`… L29 retry=${retry} best=${bestScore}`);
  }
  const level = generateOne(29, seed++, lesson, {
    usedBoards,
    usedCanonical,
    usedSolutions,
    prevSolutionKey: null,
    strictNewSolution: false,
  });
  if (!level) continue;

  const unique = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 2500 });
  if (unique.status !== 'ONE') continue;
  if (!level29NeedsT2ForFirstCat(level)) continue;

  const demo = findBestPigeonExclude(level, 2)!;
  const steps = findCoachLesson(level, 'T2');
  if (!steps.length || (steps[0]!.regionIds?.length ?? 0) < 2) continue;

  const score = 100 + demo.excludeCells.length * 8 + demo.regionIds.length * 20;
  if (score > bestScore) {
    bestScore = score;
    best = level;
    console.log('L29 candidate', {
      retry,
      score,
      regions: demo.regionIds,
      excludes: demo.excludeCells.length,
      axis: demo.axis,
    });
    if (score >= 200) break;
  }
}

if (!best) {
  console.error('Failed L29 T2-first search');
  process.exit(1);
}

pack.levels[pack.levels.findIndex((l) => l.id === 29)] = best;
console.log('SELECTED L29', {
  score: bestScore,
  plan: findLevelCoachPlan(best),
  demo: findBestPigeonExclude(best, 2),
  needsT2: level29NeedsT2ForFirstCat(best),
});

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote L29');
