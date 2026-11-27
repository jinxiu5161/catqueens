/**
 * Remake levels 1–3 for row/col onboarding.
 * L1: ≥2 singletons, place + row/col coach
 * L2: practice finding cats via row/col excludes
 * L3: singleton pre-shown + neighbor exclude coach
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
import { isNoGuessLevel } from '../assets/scripts/core/level/LevelDifficulty';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { neighborIndexes } from '../assets/scripts/core/puzzle/PuzzleRules';
import { generateOne } from './generate-levels';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');

const TARGETS = [1, 2, 3];

const pack = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
  schemaVersion: number;
  levels: LevelDefinition[];
};

const usedBoards = new Set<string>();
const usedCanonical = new Set<string>();
const usedSolutions = new Set<string>();
for (const l of pack.levels) {
  if (TARGETS.includes(l.id)) continue;
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

function scoreEarly(id: number, level: LevelDefinition): number {
  const singles = singletonSolutionCats(level);
  if (singles.length < 1) return -1;
  const ng = isNoGuessLevel(level);
  if (!ng.ok) return -1;

  if (id === 1) {
    const plan = findLevelCoachPlan(level);
    if (!plan || plan.steps.length < 2) return -1;
    if (plan.steps[0]?.action !== 'PLACE_CAT') return -1;
    if (plan.steps[1]?.action !== 'EXCLUDE') return -1;
    // Prefer 2–3 singletons so row/col chain finishes the board.
    return singles.length * 50 + plan.steps[1]!.targetCells.length * 5;
  }
  if (id === 2) {
    // Practice: several singletons + short forced chain
    if (singles.length < 2) return -1;
    return singles.length * 40 + Math.min(ng.steps, 6) * 5;
  }
  // id === 3
  const { steps, prePlaceCats } = findL3Lesson(level);
  if (!steps.length || !prePlaceCats.length) return -1;
  const cat = prePlaceCats[0]!;
  const n = neighborIndexes(cat, level.size).length;
  // Prefer a singleton with many neighbors to swipe, plus another singleton later.
  return n * 20 + singles.length * 30;
}

for (const id of TARGETS) {
  const lesson = curriculumFor(id);
  // Force enough singletons for onboarding feel
  const softLesson = {
    ...lesson,
    minSingles: id === 3 ? 1 : 2,
    maxSingles: 3,
    mode: id === 1 ? ('teach' as const) : lesson.mode,
  };

  let best: LevelDefinition | null = null;
  let bestScore = -1;
  let seed = 20261128 + id * 13331;
  const maxRetry = 800;

  for (let retry = 0; retry < maxRetry; retry++) {
    if (retry > 0 && retry % 100 === 0) {
      console.log(`… L${id} retry=${retry} best=${bestScore}`);
    }
    // Consecutive 4×4 levels must alternate solution layouts (test + variety).
    if (id > 1) {
      const prev = pack.levels.find((l) => l.id === id - 1);
      if (prev?.solution) {
        usedSolutions.clear();
        usedSolutions.add(
          `${prev.size}|${[...prev.solution].sort((a, b) => a - b).join(',')}`,
        );
      }
    }
    const level = generateOne(id, seed++, softLesson, {
      usedBoards,
      usedCanonical,
      usedSolutions,
      prevSolutionKey: null,
      strictNewSolution: id > 1,
    });
    if (!level) continue;
    const score = scoreEarly(id, level);
    if (score < 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = level;
      console.log(`L${id} candidate`, {
        retry,
        score,
        singles: singletonSolutionCats(level),
      });
      if (id === 1 && score >= 160) break;
      if (id === 2 && score >= 120) break;
      if (id === 3 && score >= 140) break;
    }
  }

  if (!best) {
    console.error(`Failed early level ${id}`);
    process.exit(1);
  }

  const idx = pack.levels.findIndex((l) => l.id === id);
  pack.levels[idx!] = best;
  usedBoards.add(`${best.size}|R:${best.regions.join(',')}|S:${best.solution!.join(',')}`);
  usedSolutions.add(`${best.size}|${[...best.solution!].sort((a, b) => a - b).join(',')}`);

  const plan = findLevelCoachPlan(best);
  console.log(`SELECTED L${id}`, {
    score: bestScore,
    singles: singletonSolutionCats(best),
    guide: plan?.steps.map((s) => `${s.action}×${s.targetCells.length}`),
    prePlace: plan?.prePlaceCats,
  });
}

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote levels 1–3');
