import { areAdjacent8, neighborIndexes } from './PuzzleRules';
import type { CellState, LevelDefinition } from './PuzzleTypes';
import { colOf, rowOf } from './PuzzleTypes';
import { puzzleValidator } from './PuzzleValidator';

export type SolveStatus = 'ZERO' | 'ONE' | 'MANY' | 'TIMEOUT';

export interface SolveResult {
  status: SolveStatus;
  solutionCount: number;
  solutions: number[][];
  nodes: number;
  elapsedMs: number;
}

export interface SolveOptions {
  maxSolutions?: number;
  timeoutMs?: number;
  excluded?: Set<number>;
  preplaced?: number[];
}

interface SearchState {
  size: number;
  regions: number[];
  excluded: Set<number>;
  rowUsed: boolean[];
  colUsed: boolean[];
  regionUsed: Map<number, boolean>;
  cats: number[];
  catSet: Set<number>;
  nodes: number;
  deadline: number;
  timedOut: boolean;
  solutions: number[][];
  maxSolutions: number;
}

function canPlace(state: SearchState, index: number): boolean {
  if (state.excluded.has(index) || state.catSet.has(index)) return false;
  const r = rowOf(index, state.size);
  const c = colOf(index, state.size);
  if (state.rowUsed[r] || state.colUsed[c]) return false;
  if (state.regionUsed.get(state.regions[index]!)) return false;
  for (const n of neighborIndexes(index, state.size)) {
    if (state.catSet.has(n)) return false;
  }
  return true;
}

function place(state: SearchState, index: number): void {
  const r = rowOf(index, state.size);
  const c = colOf(index, state.size);
  state.rowUsed[r] = true;
  state.colUsed[c] = true;
  state.regionUsed.set(state.regions[index]!, true);
  state.cats.push(index);
  state.catSet.add(index);
}

function unplace(state: SearchState, index: number): void {
  const r = rowOf(index, state.size);
  const c = colOf(index, state.size);
  state.rowUsed[r] = false;
  state.colUsed[c] = false;
  state.regionUsed.set(state.regions[index]!, false);
  state.cats.pop();
  state.catSet.delete(index);
}

function selectRow(state: SearchState): number {
  let bestRow = -1;
  let bestCount = Infinity;
  for (let r = 0; r < state.size; r++) {
    if (state.rowUsed[r]) continue;
    let count = 0;
    for (let c = 0; c < state.size; c++) {
      const idx = r * state.size + c;
      if (canPlace(state, idx)) count += 1;
    }
    if (count < bestCount) {
      bestCount = count;
      bestRow = r;
      if (count === 0) return bestRow;
    }
  }
  return bestRow;
}

function dfs(state: SearchState): void {
  if (state.timedOut || state.solutions.length >= state.maxSolutions) return;
  if (Date.now() > state.deadline) {
    state.timedOut = true;
    return;
  }
  state.nodes += 1;

  if (state.cats.length === state.size) {
    state.solutions.push([...state.cats].sort((a, b) => a - b));
    return;
  }

  const row = selectRow(state);
  if (row < 0) return;

  for (let c = 0; c < state.size; c++) {
    const idx = row * state.size + c;
    if (!canPlace(state, idx)) continue;
    place(state, idx);
    dfs(state);
    unplace(state, idx);
    if (state.timedOut || state.solutions.length >= state.maxSolutions) return;
  }
}

export class PuzzleSolver {
  solve(level: LevelDefinition, options: SolveOptions = {}): SolveResult {
    const maxSolutions = options.maxSolutions ?? 2;
    const timeoutMs = options.timeoutMs ?? 5000;
    const excluded = options.excluded ?? new Set<number>();
    const preplaced = options.preplaced ?? [];
    const started = Date.now();

    if (!puzzleValidator.validateBoard(level, preplaced).isValidSoFar) {
      return { status: 'ZERO', solutionCount: 0, solutions: [], nodes: 0, elapsedMs: 0 };
    }

    const state: SearchState = {
      size: level.size,
      regions: level.regions,
      excluded,
      rowUsed: Array.from({ length: level.size }, () => false),
      colUsed: Array.from({ length: level.size }, () => false),
      regionUsed: new Map(),
      cats: [],
      catSet: new Set(),
      nodes: 0,
      deadline: Date.now() + timeoutMs,
      timedOut: false,
      solutions: [],
      maxSolutions,
    };

    for (const cell of preplaced) {
      if (state.catSet.has(cell)) continue;
      if (!canPlace(state, cell)) {
        return {
          status: 'ZERO',
          solutionCount: 0,
          solutions: [],
          nodes: 0,
          elapsedMs: Date.now() - started,
        };
      }
      place(state, cell);
    }

    dfs(state);
    const elapsedMs = Date.now() - started;

    if (state.timedOut && state.solutions.length < maxSolutions) {
      return {
        status: 'TIMEOUT',
        solutionCount: state.solutions.length,
        solutions: state.solutions,
        nodes: state.nodes,
        elapsedMs,
      };
    }

    const count = state.solutions.length;
    const status: SolveStatus = count === 0 ? 'ZERO' : count === 1 ? 'ONE' : 'MANY';
    return { status, solutionCount: count, solutions: state.solutions, nodes: state.nodes, elapsedMs };
  }

  solveFromBoard(level: LevelDefinition, board: CellState[], options: SolveOptions = {}): SolveResult {
    const excluded = new Set<number>();
    const preplaced: number[] = [];
    for (let i = 0; i < board.length; i++) {
      if (board[i] === 'EXCLUDED') excluded.add(i);
      if (board[i] === 'CAT') preplaced.push(i);
    }
    return this.solve(level, { ...options, excluded, preplaced });
  }

  static touches(a: number, b: number, size: number): boolean {
    return areAdjacent8(a, b, size);
  }
}

export const puzzleSolver = new PuzzleSolver();
