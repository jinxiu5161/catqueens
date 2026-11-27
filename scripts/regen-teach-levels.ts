/**
 * Remake T1–T6 teach boards so the interactive coach feels powerful.
 * Usage: npx tsx scripts/regen-teach-levels.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TECHNIQUE_GUIDE_LEVEL,
  curriculumFor,
  type Lesson,
} from '../assets/scripts/core/level/LevelTechniques';
import {
  findCoachLesson,
  scoreCoachLesson,
  teachCoachMinScore,
} from '../assets/scripts/core/level/TechniqueCoach';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { generateOne } from './generate-levels';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');

const TEACH_IDS = Object.values(TECHNIQUE_GUIDE_LEVEL).filter(
  (x): x is number => typeof x === 'number',
);

const pack = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
  schemaVersion: number;
  levels: LevelDefinition[];
};

function fingerprintsExcluding(ids: Set<number>): {
  usedBoards: Set<string>;
  usedCanonical: Set<string>;
  usedSolutions: Set<string>;
} {
  const usedBoards = new Set<string>();
  const usedCanonical = new Set<string>();
  const usedSolutions = new Set<string>();
  for (const l of pack.levels) {
    if (ids.has(l.id)) continue;
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
  return { usedBoards, usedCanonical, usedSolutions };
}

const exclude = new Set(TEACH_IDS);
const { usedBoards, usedCanonical, usedSolutions } = fingerprintsExcluding(exclude);

for (const id of TEACH_IDS.sort((a, b) => a - b)) {
  const lesson = curriculumFor(id);
  const min = teachCoachMinScore(lesson.technique);
  let best: LevelDefinition | null = null;
  let bestScore = -1;
  let seed = 20261127 + id * 9973;
  const maxRetry = lesson.size >= 8 ? 500 : 700;

  for (let retry = 0; retry < maxRetry; retry++) {
    let softLesson: Lesson = lesson;
    // Mid-search: ease pigeonhole-3 → 2 so T4 teach still finds a clear clear-out.
    if (retry > maxRetry * 0.45 && lesson.requirePigeonhole === 3) {
      softLesson = { ...lesson, requirePigeonhole: 2 };
    }
    if (retry > maxRetry * 0.55 && lesson.preferDualPairs) {
      softLesson = { ...lesson, preferDualPairs: false, requireLinePin: true };
    }
    if (retry > 0 && retry % 80 === 0) {
      console.log(`… L${id} ${lesson.technique} retry=${retry} best=${bestScore}`);
    }

    const level = generateOne(id, seed++, softLesson, {
      usedBoards,
      usedCanonical,
      usedSolutions,
      prevSolutionKey: null,
      strictNewSolution: retry < maxRetry * 0.5,
    });
    if (!level) continue;

    const steps = findCoachLesson(level, lesson.technique);
    const score = scoreCoachLesson(steps);
    if (score < min) continue;

    if (score > bestScore) {
      bestScore = score;
      best = level;
      console.log(`L${id} ${lesson.technique} candidate`, {
        retry,
        score,
        steps: steps.map((s) => `${s.action}:${s.targetCells.length}`),
      });
      if (score >= min + 40) break;
    }
  }

  if (!best) {
    console.error(`Failed teach level ${id} (${lesson.technique})`);
    process.exit(1);
  }

  const idx = pack.levels.findIndex((l) => l.id === id);
  if (idx < 0) {
    console.error(`missing level ${id}`);
    process.exit(1);
  }
  pack.levels[idx] = best;
  usedBoards.add(`${best.size}|R:${best.regions.join(',')}|S:${best.solution!.join(',')}`);
  usedSolutions.add(`${best.size}|${[...best.solution!].sort((a, b) => a - b).join(',')}`);
  console.log(`SELECTED L${id}`, {
    tech: lesson.technique,
    score: bestScore,
    steps: findCoachLesson(best, lesson.technique).map(
      (s) => `${s.action}×${s.targetCells.length}`,
    ),
  });
}

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote teach levels', TEACH_IDS.join(', '));
