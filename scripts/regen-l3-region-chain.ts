/**
 * Remake level 3 so excluding neighbors shrinks another color to one open cell.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculumFor } from '../assets/scripts/core/level/LevelTechniques';
import {
  findL3Lesson,
  findLevelCoachPlan,
  singletonSolutionCats,
} from '../assets/scripts/core/level/TechniqueCoach';
import {
  level2RowColChainOk,
  level3AdjChainOk,
  regionOpenSingletons,
} from '../assets/scripts/core/level/OnboardingChain';
import { isNoGuessLevel } from '../assets/scripts/core/level/LevelDifficulty';
import { neighborIndexes } from '../assets/scripts/core/puzzle/PuzzleRules';
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
for (const l of pack.levels) {
  if (l.id === 3 || l.id === 4) continue;
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
}

function solKey(level: LevelDefinition): string {
  return `${level.size}|${[...level.solution!].sort((a, b) => a - b).join(',')}`;
}

// Keep L2 as-is; verify it still passes.
const l2 = pack.levels.find((l) => l.id === 2)!;
if (!level2RowColChainOk(l2)) {
  console.error('L2 chain broken unexpectedly');
  process.exit(1);
}

const usedSolutions = new Set<string>([solKey(l2)]);
const lesson = { ...curriculumFor(3), minSingles: 1, maxSingles: 1 };

let best: LevelDefinition | null = null;
let bestScore = -1;
let seed = 20261129 * 3;
const maxRetry = 8000;

for (let retry = 0; retry < maxRetry; retry++) {
  if (retry > 0 && retry % 400 === 0) {
    console.log(`… L3 retry=${retry} best=${bestScore}`);
  }
  const level = generateOne(3, seed++, lesson, {
    usedBoards,
    usedCanonical,
    usedSolutions,
    prevSolutionKey: null,
    strictNewSolution: true,
  });
  if (!level) continue;
  if (!isNoGuessLevel(level).ok) continue;
  if (singletonSolutionCats(level).length !== 1) continue;
  if (!level3AdjChainOk(level)) continue;

  const plan = findL3Lesson(level);
  if (!plan.steps.length || plan.prePlaceCats.length !== 1) continue;
  if (plan.steps[0]!.targetCells.length < 3) continue;

  const first = plan.prePlaceCats[0]!;
  const unlocked = regionOpenSingletons(
    level,
    [first],
    new Set(neighborIndexes(first, level.size)),
  );
  const score = 100 + unlocked.length * 30 + plan.steps[0]!.targetCells.length * 5;
  if (score > bestScore) {
    bestScore = score;
    best = level;
    console.log('L3 candidate', {
      retry,
      score,
      first,
      unlocked,
      sol: level.solution,
      neighbors: neighborIndexes(first, 4).length,
    });
    if (score >= 160) break;
  }
}

if (!best) {
  console.error('Failed to find L3 region-chain board');
  process.exit(1);
}

pack.levels[pack.levels.findIndex((l) => l.id === 3)] = best;
usedBoards.add(`${best.size}|R:${best.regions.join(',')}|S:${best.solution!.join(',')}`);
console.log('SELECTED L3', {
  score: bestScore,
  singles: singletonSolutionCats(best),
  sol: best.solution,
  plan: findLevelCoachPlan(best),
  chain: level3AdjChainOk(best),
});

// Re-alt L4 if needed
{
  const l3 = pack.levels.find((l) => l.id === 3)!;
  const l4 = pack.levels.find((l) => l.id === 4)!;
  if (solKey(l3) === solKey(l4)) {
    console.log('Regenerating L4 to alternate solution…');
    const ban = new Set([solKey(l3)]);
    const l4lesson = { ...curriculumFor(4), minSingles: 1, maxSingles: 2 };
    let next4: LevelDefinition | null = null;
    let s = 700001;
    for (let retry = 0; retry < 3000 && !next4; retry++) {
      const level = generateOne(4, s++, l4lesson, {
        usedBoards,
        usedCanonical,
        usedSolutions: ban,
        prevSolutionKey: null,
        strictNewSolution: true,
      });
      if (!level || !isNoGuessLevel(level).ok) continue;
      if (singletonSolutionCats(level).length < 1) continue;
      next4 = level;
    }
    if (!next4) {
      console.error('Failed L4');
      process.exit(1);
    }
    pack.levels[pack.levels.findIndex((l) => l.id === 4)] = next4;
    console.log('SELECTED L4', next4.solution);
  }
}

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote L3');
