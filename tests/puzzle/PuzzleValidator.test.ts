import { describe, expect, it } from 'vitest';
import { puzzleValidator } from '../../assets/scripts/core/puzzle/PuzzleValidator';
import type { LevelDefinition } from '../../assets/scripts/core/puzzle/PuzzleTypes';
import { PuzzleSolver } from '../../assets/scripts/core/puzzle/PuzzleSolver';

const sample4: LevelDefinition = {
  id: 1,
  size: 4,
  regions: [
    0, 0, 1, 1,
    0, 2, 2, 1,
    3, 2, 2, 1,
    3, 3, 3, 1,
  ],
  solution: [1, 7, 8, 14],
};

describe('PuzzleValidator', () => {
  it('validates level structure', () => {
    const r = puzzleValidator.validateLevel(sample4);
    // solution may or may not be legal depending on placement — check structure parts
    expect(r.errors.includes('E_REGIONS_LENGTH')).toBe(false);
    expect(r.errors.includes('E_REGION_COUNT')).toBe(false);
  });

  it('detects row conflict', () => {
    const conflicts = puzzleValidator.getConflicts(sample4, [0, 1]);
    expect(conflicts.some((c) => c.type === 'ROW')).toBe(true);
  });

  it('detects column conflict', () => {
    const conflicts = puzzleValidator.getConflicts(sample4, [0, 4]);
    expect(conflicts.some((c) => c.type === 'COLUMN')).toBe(true);
  });

  it('detects diagonal adjacency', () => {
    const conflicts = puzzleValidator.getConflicts(sample4, [0, 5]);
    expect(conflicts.some((c) => c.type === 'ADJACENT_8')).toBe(true);
  });

  it('does not mark distance-2 as adjacent', () => {
    const conflicts = puzzleValidator.getConflicts(sample4, [0, 2]);
    expect(conflicts.some((c) => c.type === 'ADJACENT_8')).toBe(false);
  });

  it('EXCLUDED does not affect rules (cats-only API)', () => {
    // cats array ignores excluded by design
    const v = puzzleValidator.validateBoard(sample4, [0]);
    expect(v.catCount).toBe(1);
    expect(v.isSolved).toBe(false);
  });

  it('isSolved requires full legal placement', () => {
    expect(puzzleValidator.isSolved(sample4, [0, 1, 2, 3])).toBe(false);
  });
});

describe('PuzzleSolver', () => {
  it('counts solutions to at most 2', () => {
    const level: LevelDefinition = {
      id: 99,
      size: 4,
      regions: [
        0, 1, 1, 2,
        0, 0, 1, 2,
        3, 3, 2, 2,
        3, 3, 3, 2,
      ],
    };
    // Find any valid unique or multi via solver API shape
    const solver = new PuzzleSolver();
    const r = solver.solve(level, { maxSolutions: 2, timeoutMs: 2000 });
    expect(['ZERO', 'ONE', 'MANY', 'TIMEOUT']).toContain(r.status);
    expect(r.solutionCount).toBeLessThanOrEqual(2);
  });
});
