import type { LevelDefinition } from '../puzzle/PuzzleTypes';

export type { LevelDefinition };

export interface LevelsFile {
  schemaVersion: number;
  levels: LevelDefinition[];
}
