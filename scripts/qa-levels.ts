import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelsFile } from '../assets/scripts/core/level/LevelDefinition';
import { verifyAllLevels, verifyLevelUnique } from '../assets/scripts/core/level/LevelQuality';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rangeArg = process.argv.find((a) => a.startsWith('--range='));
const range = rangeArg?.slice('--range='.length);

const file = JSON.parse(
  readFileSync(join(ROOT, 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

let levels = file.levels;
if (range) {
  const [a, b] = range.split('-').map(Number);
  levels = levels.filter((l) => l.id >= (a ?? 1) && l.id <= (b ?? 9999));
}

const { pass, fail } = verifyAllLevels(levels, 4000);
const report = levels.map((l) => verifyLevelUnique(l, 4000));
console.log(JSON.stringify({ total: levels.length, pass, failCount: fail.length, fail, report }, null, 2));
if (fail.length) process.exit(1);
