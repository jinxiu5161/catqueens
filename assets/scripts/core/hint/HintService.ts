import type { CellState, LevelDefinition } from '../puzzle/PuzzleTypes';
import { puzzleSolver } from '../puzzle/PuzzleSolver';
import type { HintResult } from './HintTypes';

/**
 * Deterministic hints only: when the current board has exactly one solution,
 * highlight a forced EMPTY cell that must be CAT.
 */
export class HintService {
  getHint(level: LevelDefinition, board: CellState[]): HintResult {
    const solve = puzzleSolver.solveFromBoard(level, board, {
      maxSolutions: 2,
      timeoutMs: 2500,
    });

    if (solve.status === 'ZERO') {
      return {
        level: 1,
        status: 'CURRENT_STATE_UNSOLVABLE',
        targetCells: [],
        explanationKey: 'hint.unsolvable',
      };
    }

    if (solve.status === 'TIMEOUT' || solve.status === 'MANY') {
      return {
        level: 2,
        status: 'NO_DETERMINISTIC_HINT',
        targetCells: [],
        explanationKey: 'hint.no_deterministic',
      };
    }

    const solution = solve.solutions[0] ?? [];
    const forced = solution.filter((idx) => board[idx] === 'EMPTY');
    if (forced.length === 0) {
      return {
        level: 1,
        status: 'NO_DETERMINISTIC_HINT',
        targetCells: [],
        explanationKey: 'hint.no_deterministic',
      };
    }

    const target = forced[0]!;
    return {
      level: 1,
      status: 'AVAILABLE',
      targetCells: [target],
      explanationKey: 'hint.forced_cell',
      explanationArgs: { cell: target + 1 },
      suggestedAction: {
        type: 'PLACE_CAT',
        before: [{ index: target, state: 'EMPTY' }],
        after: [{ index: target, state: 'CAT' }],
        timestamp: Date.now(),
      },
    };
  }
}

export const hintService = new HintService();
