import { puzzleSolver } from '../puzzle/PuzzleSolver';
import { puzzleValidator } from '../puzzle/PuzzleValidator';
import { emptyBoard } from '../puzzle/PuzzleTypes';
import type { LevelDefinition } from '../puzzle/PuzzleTypes';

export interface LevelQualityReport {
  id: number;
  ok: boolean;
  errors: string[];
  uniqueStatus: string;
}

/**
 * Strict gate: structure + reference solution legal + empty-board unique solution
 * that matches the stored solution.
 */
export function verifyLevelUnique(level: LevelDefinition, timeoutMs = 3000): LevelQualityReport {
  const errors: string[] = [];
  const struct = puzzleValidator.validateLevel(level);
  if (!struct.ok) errors.push(...struct.errors);

  if (!level.solution || level.solution.length !== level.size) {
    errors.push('E_SOLUTION_MISSING');
  } else if (!puzzleValidator.isSolved(level, level.solution)) {
    errors.push('E_SOLUTION_ILLEGAL');
  }

  const solve = puzzleSolver.solveFromBoard(level, emptyBoard(level.size), {
    maxSolutions: 2,
    timeoutMs,
  });
  if (solve.status !== 'ONE') {
    errors.push(`E_NOT_UNIQUE:${solve.status}`);
  } else if (level.solution) {
    const expected = [...level.solution].sort((a, b) => a - b);
    const got = solve.solutions[0] ?? [];
    if (JSON.stringify(expected) !== JSON.stringify(got)) {
      errors.push('E_SOLUTION_MISMATCH');
    }
  }

  return {
    id: level.id,
    ok: errors.length === 0,
    errors,
    uniqueStatus: solve.status,
  };
}

export function verifyAllLevels(
  levels: LevelDefinition[],
  timeoutMs = 3000,
): { pass: number; fail: LevelQualityReport[] } {
  const fail: LevelQualityReport[] = [];
  for (const level of levels) {
    const r = verifyLevelUnique(level, timeoutMs);
    if (!r.ok) fail.push(r);
  }
  return { pass: levels.length - fail.length, fail };
}
