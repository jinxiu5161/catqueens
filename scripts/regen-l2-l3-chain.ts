/**
 * Remake levels 2–3 so the taught exclude is required to unlock the next cat.
 * L2: place first singleton → exclude row/col → second cat appears
 * L3: first singleton shown → exclude neighbors → second cat appears
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
  beginnerForcedCats,
  level2RowColChainOk,
  level3AdjChainOk,
} from '../assets/scripts/core/level/OnboardingChain';
import { isNoGuessLevel } from '../assets/scripts/core/level/LevelDifficulty';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { generateOne } from './generate-levels';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(ROOT, 'assets/resources/data/levels.json');
const tsPath = join(ROOT, 'assets/scripts/data/StarterLevels.ts');

const TARGETS = [2, 3];

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
}

function solKey(level: LevelDefinition): string {
  return `${level.size}|${[...level.solution!].sort((a, b) => a - b).join(',')}`;
}

for (const id of TARGETS) {
  const base = curriculumFor(id);
  const lesson = {
    ...base,
    minSingles: 1,
    maxSingles: 1,
    mode: id === 2 ? ('practice' as const) : base.mode,
  };

  // Alternate vs previous 4×4 solution
  usedSolutions.clear();
  const prev = pack.levels.find((l) => l.id === id - 1);
  if (prev?.solution) usedSolutions.add(solKey(prev));

  let best: LevelDefinition | null = null;
  let bestScore = -1;
  let seed = 20261128 + id * 424242;
  const maxRetry = 4000;

  for (let retry = 0; retry < maxRetry; retry++) {
    if (retry > 0 && retry % 200 === 0) {
      console.log(`… L${id} retry=${retry} best=${bestScore}`);
    }
    const level = generateOne(id, seed++, lesson, {
      usedBoards,
      usedCanonical,
      usedSolutions,
      prevSolutionKey: null,
      strictNewSolution: true,
    });
    if (!level) continue;
    if (!isNoGuessLevel(level).ok) continue;
    if (singletonSolutionCats(level).length !== 1) continue;

    const chainOk = id === 2 ? level2RowColChainOk(level) : level3AdjChainOk(level);
    if (!chainOk) continue;

    if (id === 3) {
      const plan = findL3Lesson(level);
      if (!plan.steps.length || !plan.prePlaceCats.length) continue;
      if (plan.steps[0]!.targetCells.length < 3) continue;
    }

    const first = singletonSolutionCats(level)[0]!;
    let score = 100;
    if (id === 2) {
      const after = beginnerForcedCats(
        level,
        [first],
        new Set(
          Array.from({ length: level.size * level.size }, (_, i) => i).filter((i) => {
            if (i === first) return false;
            const size = level.size;
            const r = Math.floor(first / size);
            const c = first % size;
            return Math.floor(i / size) === r || i % size === c;
          }),
        ),
      );
      score += after.length * 20;
    } else {
      const plan = findLevelCoachPlan(level);
      score += (plan?.steps[0]?.targetCells.length ?? 0) * 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = level;
      console.log(`L${id} candidate`, {
        retry,
        score,
        first,
        sol: level.solution,
      });
      if (score >= 140) break;
    }
  }

  if (!best) {
    console.error(`Failed level ${id} chain search`);
    process.exit(1);
  }

  const idx = pack.levels.findIndex((l) => l.id === id);
  pack.levels[idx!] = best;
  usedBoards.add(`${best.size}|R:${best.regions.join(',')}|S:${best.solution!.join(',')}`);
  console.log(`SELECTED L${id}`, {
    score: bestScore,
    singles: singletonSolutionCats(best),
    sol: best.solution,
    l3: id === 3 ? findLevelCoachPlan(best) : undefined,
  });
}

// Ensure L4 still alternates vs L3
{
  const l3 = pack.levels.find((l) => l.id === 3)!;
  const l4 = pack.levels.find((l) => l.id === 4)!;
  const s3 = solKey(l3);
  const s4 = solKey(l4);
  if (s3 === s4) {
    console.log('L4 shares solution with L3 — regenerating L4…');
    usedSolutions.clear();
    usedSolutions.add(s3);
    const lesson = { ...curriculumFor(4), minSingles: 1, maxSingles: 2 };
    let best: LevelDefinition | null = null;
    let seed = 500001;
    for (let retry = 0; retry < 2000 && !best; retry++) {
      const level = generateOne(4, seed++, lesson, {
        usedBoards,
        usedCanonical,
        usedSolutions,
        prevSolutionKey: null,
        strictNewSolution: true,
      });
      if (!level || !isNoGuessLevel(level).ok) continue;
      if (singletonSolutionCats(level).length < 1) continue;
      best = level;
    }
    if (!best) {
      console.error('Failed L4 re-alt');
      process.exit(1);
    }
    pack.levels[pack.levels.findIndex((l) => l.id === 4)] = best;
    console.log('SELECTED L4', best.solution);
  }
}

writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote L2/L3 chain boards');
