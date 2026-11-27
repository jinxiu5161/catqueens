import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { verifyLevelUnique } from '../../assets/scripts/core/level/LevelQuality';
import { emptyBoard } from '../../assets/scripts/core/puzzle/PuzzleTypes';
import { puzzleSolver } from '../../assets/scripts/core/puzzle/PuzzleSolver';
import { hintService } from '../../assets/scripts/core/hint/HintService';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('starter levels unique solution gate', () => {
  it('has 500 levels (max size 10)', () => {
    expect(file.levels.length).toBeGreaterThanOrEqual(500);
    expect(Math.max(...file.levels.map((l) => l.size))).toBeLessThanOrEqual(10);
  });

  it('levels 1–7 are 4×4; level 8 starts 5×5; first 40 stay no-guess', () => {
    for (let id = 1; id <= 7; id++) {
      const level = file.levels.find((l) => l.id === id)!;
      expect(level.size, `level ${id}`).toBe(4);
      expect(level.noGuess, `level ${id}`).toBe(true);
    }
    expect(file.levels.find((l) => l.id === 8)!.size).toBe(5);
    expect(file.levels.filter((l) => l.size === 4).length).toBe(7);
    const early = file.levels.filter((l) => l.id <= 40);
    expect(early.length).toBe(40);
    for (const level of early) {
      expect(level.noGuess, `level ${level.id} should be noGuess`).toBe(true);
    }
  });

  it('within each size stage, singleton regions never increase', async () => {
    const { countSingletonRegions } = await import(
      '../../assets/scripts/core/level/LevelDifficulty'
    );
    for (let i = 1; i < file.levels.length; i++) {
      const a = file.levels[i - 1]!;
      const b = file.levels[i]!;
      if (a.size !== b.size) continue;
      expect(
        countSingletonRegions(b),
        `level ${b.id} singletons rose vs ${a.id}`,
      ).toBeLessThanOrEqual(countSingletonRegions(a));
    }
  });

  for (const level of file.levels) {
    it(`level ${level.id} is uniquely solvable from empty board`, () => {
      const report = verifyLevelUnique(level, 4000);
      expect(report.ok, `level ${level.id}: ${report.errors.join(',')}`).toBe(true);
      expect(report.uniqueStatus).toBe('ONE');
    });
  }

  it('level 1 hint on empty board is available (not unsolvable)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const hint = hintService.getHint(level, emptyBoard(level.size));
    expect(hint.status).toBe('AVAILABLE');
    expect(hint.targetCells.length).toBeGreaterThan(0);
  });

  it('excluding a solution cell makes board-with-excludes ZERO, but cats-only stays ONE', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const board = emptyBoard(level.size);
    const forced = level.solution![0]!;
    board[forced] = 'EXCLUDED';
    const withExcludes = puzzleSolver.solveFromBoard(level, board, {
      maxSolutions: 2,
      timeoutMs: 3000,
    });
    expect(withExcludes.status).toBe('ZERO');
    // Product: EXCLUDED is a soft note — gameplay / hints ignore it for solvability
    const catsOnly = puzzleSolver.solveFromCatsOnly(level, board, {
      maxSolutions: 2,
      timeoutMs: 3000,
    });
    expect(catsOnly.status).toBe('ONE');
    const emptySolve = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 3000 });
    expect(emptySolve.status).toBe('ONE');
  });

  it('hint still available after excluding a solution cell (excludes ignored)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const board = emptyBoard(level.size);
    board[level.solution![0]!] = 'EXCLUDED';
    const hint = hintService.getHint(level, board);
    expect(hint.status).toBe('AVAILABLE');
  });
});
