import { areAdjacent8, regionsAreFourConnected, uniqueRegionIds } from './PuzzleRules';
import type {
  BoardValidation,
  Conflict,
  LevelDataValidationResult,
  LevelDefinition,
} from './PuzzleTypes';
import { colOf, rowOf } from './PuzzleTypes';

const CONFLICT_KEYS: Record<Conflict['type'], string> = {
  ROW: 'conflict.row',
  COLUMN: 'conflict.column',
  REGION: 'conflict.region',
  ADJACENT_8: 'conflict.adjacent',
};

function pushConflict(
  map: Map<string, Conflict>,
  type: Conflict['type'],
  cells: number[],
): void {
  const key = `${type}:${[...cells].sort((a, b) => a - b).join(',')}`;
  if (!map.has(key)) {
    map.set(key, { type, cells: [...cells], messageKey: CONFLICT_KEYS[type] });
  }
}

export class PuzzleValidator {
  validateLevel(level: LevelDefinition): LevelDataValidationResult {
    const errors: string[] = [];
    const { size, regions, id } = level;

    if (!Number.isInteger(id) || id < 1) errors.push('E_ID_RANGE');
    if (!Number.isInteger(size) || size < 4 || size > 11) errors.push('E_SIZE_RANGE');
    if (!Array.isArray(regions) || regions.length !== size * size) {
      errors.push('E_REGIONS_LENGTH');
    } else {
      const ids = uniqueRegionIds(regions);
      if (ids.length !== size) errors.push('E_REGION_COUNT');
      if (!regionsAreFourConnected(level)) errors.push('E_REGION_CONNECTIVITY');
    }

    if (level.solution) {
      if (level.solution.length !== size) errors.push('E_SOLUTION_LENGTH');
      else if (new Set(level.solution).size !== size) errors.push('E_SOLUTION_DUP');
      else if (!this.isSolved(level, level.solution)) errors.push('E_SOLUTION_ILLEGAL');
    }

    return { ok: errors.length === 0, errors };
  }

  getConflicts(level: LevelDefinition, cats: number[]): Conflict[] {
    const { size, regions } = level;
    const conflictMap = new Map<string, Conflict>();
    const rowCount = Array.from({ length: size }, () => 0);
    const colCount = Array.from({ length: size }, () => 0);
    const regionCount = new Map<number, number>();

    for (const cell of cats) {
      const r = rowOf(cell, size);
      const c = colOf(cell, size);
      rowCount[r]! += 1;
      colCount[c]! += 1;
      const regionId = regions[cell]!;
      regionCount.set(regionId, (regionCount.get(regionId) ?? 0) + 1);
    }

    for (const cell of cats) {
      const r = rowOf(cell, size);
      const c = colOf(cell, size);
      const regionId = regions[cell]!;

      if (rowCount[r]! > 1) {
        pushConflict(conflictMap, 'ROW', cats.filter((x) => rowOf(x, size) === r));
      }
      if (colCount[c]! > 1) {
        pushConflict(conflictMap, 'COLUMN', cats.filter((x) => colOf(x, size) === c));
      }
      if ((regionCount.get(regionId) ?? 0) > 1) {
        pushConflict(conflictMap, 'REGION', cats.filter((x) => regions[x] === regionId));
      }

      for (const other of cats) {
        if (other <= cell) continue;
        if (areAdjacent8(cell, other, size)) {
          pushConflict(conflictMap, 'ADJACENT_8', [cell, other]);
        }
      }
    }

    return [...conflictMap.values()];
  }

  validateBoard(level: LevelDefinition, cats: number[]): BoardValidation {
    const conflicts = this.getConflicts(level, cats);
    const conflicted = new Set<number>();
    for (const c of conflicts) for (const cell of c.cells) conflicted.add(cell);
    const validCatCount = cats.filter((c) => !conflicted.has(c)).length;
    return {
      isValidSoFar: conflicts.length === 0,
      catCount: cats.length,
      validCatCount,
      conflicts,
      isSolved: this.isSolved(level, cats),
    };
  }

  isSolved(level: LevelDefinition, cats: number[]): boolean {
    const { size, regions } = level;
    if (cats.length !== size) return false;
    if (new Set(cats).size !== size) return false;

    const rowCount = Array.from({ length: size }, () => 0);
    const colCount = Array.from({ length: size }, () => 0);
    const regionCount = new Map<number, number>();

    for (const cell of cats) {
      if (cell < 0 || cell >= size * size) return false;
      rowCount[rowOf(cell, size)]! += 1;
      colCount[colOf(cell, size)]! += 1;
      const rid = regions[cell]!;
      regionCount.set(rid, (regionCount.get(rid) ?? 0) + 1);
    }

    if (rowCount.some((n) => n !== 1)) return false;
    if (colCount.some((n) => n !== 1)) return false;

    const regionIds = uniqueRegionIds(regions);
    if (regionIds.length !== size) return false;
    for (const rid of regionIds) {
      if (regionCount.get(rid) !== 1) return false;
    }

    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        if (areAdjacent8(cats[i]!, cats[j]!, size)) return false;
      }
    }
    return true;
  }

  getCandidateCells(level: LevelDefinition, cats: number[]): number[] {
    const { size, regions } = level;
    const catSet = new Set(cats);
    const usedRows = new Set(cats.map((c) => rowOf(c, size)));
    const usedCols = new Set(cats.map((c) => colOf(c, size)));
    const usedRegions = new Set(cats.map((c) => regions[c]!));
    const out: number[] = [];

    for (let i = 0; i < size * size; i++) {
      if (catSet.has(i)) continue;
      const r = rowOf(i, size);
      const c = colOf(i, size);
      if (usedRows.has(r) || usedCols.has(c) || usedRegions.has(regions[i]!)) continue;
      let adj = false;
      for (const cat of cats) {
        if (areAdjacent8(i, cat, size)) {
          adj = true;
          break;
        }
      }
      if (!adj) out.push(i);
    }
    return out;
  }
}

export const puzzleValidator = new PuzzleValidator();
