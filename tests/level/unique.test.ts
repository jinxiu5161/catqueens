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
  it('has 50 levels', () => {
    expect(file.levels.length).toBeGreaterThanOrEqual(50);
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

  it('excluding a solution cell makes current state unsolvable, not the level', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const board = emptyBoard(level.size);
    const forced = level.solution![0]!;
    board[forced] = 'EXCLUDED';
    const solve = puzzleSolver.solveFromBoard(level, board, { maxSolutions: 2, timeoutMs: 3000 });
    expect(solve.status).toBe('ZERO');
    const emptySolve = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 3000 });
    expect(emptySolve.status).toBe('ONE');
  });
});
