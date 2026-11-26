export type CellState = 'EMPTY' | 'EXCLUDED' | 'CAT';

export type ConflictType = 'ROW' | 'COLUMN' | 'REGION' | 'ADJACENT_8';

export interface Conflict {
  type: ConflictType;
  cells: number[];
  messageKey: string;
}

export interface LevelDefinition {
  id: number;
  size: number;
  /** Length size*size; each cell's region id. */
  regions: number[];
  /** Reference solution cell indexes (QA / hint only; never show in normal UI). */
  solution?: number[];
  chapterId?: number;
  /** 1–10 star difficulty for UI. */
  difficulty?: number;
  /** Chinese tier label, e.g. 入门 / 简单 / 普通 / 进阶 / 困难 / 专家. */
  difficultyLabel?: string;
  /** True when solvable by forced moves only (no guessing). */
  noGuess?: boolean;
  elite?: boolean;
}

export interface BoardValidation {
  isValidSoFar: boolean;
  catCount: number;
  validCatCount: number;
  conflicts: Conflict[];
  isSolved: boolean;
}

export interface LevelDataValidationResult {
  ok: boolean;
  errors: string[];
}

export interface BoardCommand {
  type: 'SET_CELL_STATE' | 'PLACE_CAT' | 'REMOVE_CAT' | 'BULK_EXCLUDE';
  before: Array<{ index: number; state: CellState }>;
  after: Array<{ index: number; state: CellState }>;
  timestamp: number;
}

export function indexOf(row: number, col: number, size: number): number {
  return row * size + col;
}

export function rowOf(index: number, size: number): number {
  return Math.floor(index / size);
}

export function colOf(index: number, size: number): number {
  return index % size;
}

export function emptyBoard(size: number): CellState[] {
  return Array.from({ length: size * size }, () => 'EMPTY');
}

export function catsFromBoard(board: CellState[]): number[] {
  const cats: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 'CAT') cats.push(i);
  }
  return cats;
}
