import type { BoardValidation, LevelDefinition } from './PuzzleTypes';
import { puzzleValidator } from './PuzzleValidator';

export function computeProgress(level: LevelDefinition, cats: number[]): BoardValidation {
  return puzzleValidator.validateBoard(level, cats);
}

export function progressRatio(level: LevelDefinition, cats: number[]): number {
  const v = computeProgress(level, cats);
  if (level.size <= 0) return 0;
  return Math.min(1, v.validCatCount / level.size);
}
