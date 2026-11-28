/**
 * Replace level 5 with a dramatic T1 teach board (2-cell pin → 2–3 excludes).
 * Usage: npx tsx scripts/regen-level5.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculumFor } from '../assets/scripts/core/level/LevelTechniques';
import { findCoachStep } from '../assets/scripts/core/level/TechniqueCoach';
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
  usedCanonical.add(`${l.size}|R:${canon.join(',')}|S:${[...l.solution!].sort((a, b) => a - b).join(',')}`);
  usedSolutions.add(`${l.size}|${[...l.solution!].sort((a, b) => a - b).join(',')}`);
}

const lesson = curriculumFor(5);
let best: LevelDefinition | null = null;
let bestScore = -1;

for (let seed = 1; seed <= 8000; seed++) {
  const level = generateOne(5, seed, lesson, {
    usedBoards,
    usedCanonical,
    usedSolutions,
    prevSolutionKey: null,
    strictNewSolution: true,
  });
  if (!level) continue;
  const demo = findCoachStep(level, 'T1');
  if (!demo || demo.action !== 'EXCLUDE') continue;
  const n = demo.targetCells.length;
  // focusCells is the whole locked line; region occupies the rest of that line.
  const regionSize = demo.focusCells.length - n;
  // Prefer edge-line 2-cell pin clearing 3 cells (reference feel).
  let score = n * 30 + (regionSize === 2 ? 40 : regionSize === 3 ? 20 : 0);
  if (demo.axis === 'row' && (demo.focusCells[0]! >= 20 || demo.focusCells[0]! < 5)) score += 15;
  if (n === 3 && regionSize === 2) score += 100;
  if (n >= 2) score += 50;
  if (score > bestScore) {
    bestScore = score;
    best = level;
    console.log('candidate', { seed, n, regionSize, axis: demo.axis, score });
    if (n >= 3 && regionSize === 2) break;
  }
}

if (!best) {
  console.error('Failed to find a dramatic T1 teach level');
  process.exit(1);
}

const demo = findCoachStep(best, 'T1')!;
console.log('SELECTED L5', {
  excludes: demo.targetCells.length,
  focus: demo.focusCells.length,
  axis: demo.axis,
  regionId: demo.regionId,
  regions: best.regions,
  solution: best.solution,
});

const idx = pack.levels.findIndex((l) => l.id === 5);
if (idx < 0) {
  console.error('level 5 missing');
  process.exit(1);
}
pack.levels[idx] = best;
writeFileSync(jsonPath, JSON.stringify(pack, null, 2));
writeFileSync(
  tsPath,
  `import type { LevelsFile } from '../core/level/LevelDefinition';\n\n` +
    `/** Auto-generated technique curriculum pack. Re-run: npm run generate:levels */\n` +
    `export const STARTER_LEVELS: LevelsFile = ${JSON.stringify(pack, null, 2)} as LevelsFile;\n`,
);
console.log('Wrote level 5 into pack');
