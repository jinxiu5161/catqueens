import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelsFile } from '../assets/scripts/core/level/LevelDefinition';
import { puzzleValidator } from '../assets/scripts/core/puzzle/PuzzleValidator';
import { puzzleSolver } from '../assets/scripts/core/puzzle/PuzzleSolver';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const unique = process.argv.includes('--unique');
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

const report: Array<Record<string, unknown>> = [];
let pass = 0;
for (const level of levels) {
  const struct = puzzleValidator.validateLevel(level);
  let uniqueStatus = 'SKIPPED';
  if (unique) {
    const r = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 3000 });
    uniqueStatus = r.status;
  }
  const ok = struct.ok && (!unique || uniqueStatus === 'ONE');
  if (ok) pass += 1;
  report.push({ id: level.id, size: level.size, structOk: struct.ok, errors: struct.errors, uniqueStatus, ok });
}

console.log(JSON.stringify({ total: levels.length, pass, fail: levels.length - pass, report }, null, 2));
if (pass !== levels.length) process.exit(1);
