import type { BoardValidation, Conflict } from '../../core/puzzle/PuzzleTypes';

/**
 * Derives display-only conflict overlays from PuzzleCore validation.
 * Must not re-implement rules — only consume `BoardValidation.conflicts`.
 */
export interface ConflictPresentation {
  conflictedCells: number[];
  byType: Record<Conflict['type'], number[]>;
  messageKeys: string[];
}

export function presentConflicts(validation: BoardValidation): ConflictPresentation {
  const conflicted = new Set<number>();
  const byType: ConflictPresentation['byType'] = {
    ROW: [],
    COLUMN: [],
    REGION: [],
    ADJACENT_8: [],
  };
  const messageKeys: string[] = [];

  for (const c of validation.conflicts) {
    messageKeys.push(c.messageKey);
    for (const cell of c.cells) {
      conflicted.add(cell);
      byType[c.type].push(cell);
    }
  }

  return {
    conflictedCells: [...conflicted],
    byType,
    messageKeys,
  };
}
