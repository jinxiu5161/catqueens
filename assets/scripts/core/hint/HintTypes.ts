import type { BoardCommand } from '../puzzle/PuzzleTypes';

export interface HintResult {
  level: 1 | 2 | 3;
  status: 'AVAILABLE' | 'NO_DETERMINISTIC_HINT' | 'CURRENT_STATE_UNSOLVABLE';
  targetCells: number[];
  explanationKey: string;
  explanationArgs?: Record<string, string | number>;
  suggestedAction?: BoardCommand;
}
