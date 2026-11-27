import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { verifyLevelUnique } from '../../assets/scripts/core/level/LevelQuality';
import { emptyBoard } from '../../assets/scripts/core/puzzle/PuzzleTypes';
import { puzzleSolver } from '../../assets/scripts/core/puzzle/PuzzleSolver';
import { hintService } from '../../assets/scripts/core/hint/HintService';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('starter levels unique solution gate', () => {
  it('has 500 levels (max size 10)', () => {
    expect(file.levels.length).toBeGreaterThanOrEqual(500);
    expect(Math.max(...file.levels.map((l) => l.size))).toBeLessThanOrEqual(10);
  });

  it('early curriculum: L1 T0, L2/L4 T1 guides on 5×5, L8–15 T2 on 5×5, first 50 no-guess', () => {
    expect(file.levels.find((l) => l.id === 1)!.technique).toBe('T0');
    expect(file.levels.find((l) => l.id === 1)!.size).toBe(4);
    expect(file.levels.find((l) => l.id === 1)!.requiredTech).toBe(0);
    expect(file.levels.find((l) => l.id === 2)!.size).toBe(5);
    expect(file.levels.find((l) => l.id === 2)!.technique).toBe('T1');
    expect(file.levels.find((l) => l.id === 2)!.requiredTech).toBe(1);
    expect(file.levels.find((l) => l.id === 2)!.prePlaceCats?.length).toBe(1);
    expect(file.levels.find((l) => l.id === 3)!.technique).toBe('T1');
    expect(file.levels.find((l) => l.id === 4)!.size).toBe(5);
    expect(file.levels.find((l) => l.id === 4)!.requiredTech).toBe(1);
    expect(file.levels.find((l) => l.id === 4)!.prePlaceCats?.length).toBe(1);
    expect(file.levels.find((l) => l.id === 5)!.technique).toBe('T1');
    expect(file.levels.find((l) => l.id === 8)!.technique).toBe('T2');
    expect(file.levels.find((l) => l.id === 8)!.size).toBe(5);
    for (const id of [13, 14]) {
      const level = file.levels.find((l) => l.id === id)!;
      expect(level.size, `level ${id} stays 5×5`).toBe(5);
      expect(level.technique).toBe('T2');
    }
    for (const level of file.levels.filter((l) => l.id <= 50)) {
      expect(level.noGuess, `level ${level.id} should be noGuess`).toBe(true);
    }
    expect(file.levels.find((l) => l.id === 16)!.technique).toBe('T3');
  });

  it('no two levels share the same board (incl. region-id relabel)', () => {
    const seen = new Set<string>();
    for (const level of file.levels) {
      const map = new Map<number, number>();
      let next = 0;
      const canon = level.regions
        .map((rid) => {
          let m = map.get(rid);
          if (m === undefined) {
            m = next++;
            map.set(rid, m);
          }
          return m;
        })
        .join(',');
      const key = `${level.size}|${canon}|${[...level.solution].sort((a, b) => a - b).join(',')}`;
      expect(seen.has(key), `duplicate board at level ${level.id}`).toBe(false);
      seen.add(key);
    }
  });

  it('consecutive same-size early levels alternate solution layouts', () => {
    for (let id = 2; id <= 7; id++) {
      const a = file.levels.find((l) => l.id === id - 1)!;
      const b = file.levels.find((l) => l.id === id)!;
      if (a.size !== b.size) continue;
      const sa = [...a.solution!].sort((x, y) => x - y).join(',');
      const sb = [...b.solution!].sort((x, y) => x - y).join(',');
      expect(sb, `level ${id} should alternate solution vs ${id - 1}`).not.toBe(sa);
    }
  });

  for (const level of file.levels) {
    it(`level ${level.id} is uniquely solvable from empty board`, () => {
      const report = verifyLevelUnique(level, 4000);
      expect(report.ok, `level ${level.id}: ${report.errors.join(',')}`).toBe(true);
      expect(report.uniqueStatus).toBe('ONE');
    });
  }

  it('level 1 hint on empty board is available (not unsolvable)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const hint = hintService.getHint(level, emptyBoard(level.size));
    expect(hint.status).toBe('AVAILABLE');
    expect(hint.targetCells.length).toBeGreaterThan(0);
  });

  it('excluding a solution cell makes board-with-excludes ZERO, but cats-only stays ONE', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const board = emptyBoard(level.size);
    const forced = level.solution![0]!;
    board[forced] = 'EXCLUDED';
    const withExcludes = puzzleSolver.solveFromBoard(level, board, {
      maxSolutions: 2,
      timeoutMs: 3000,
    });
    expect(withExcludes.status).toBe('ZERO');
    // Product: EXCLUDED is a soft note — gameplay / hints ignore it for solvability
    const catsOnly = puzzleSolver.solveFromCatsOnly(level, board, {
      maxSolutions: 2,
      timeoutMs: 3000,
    });
    expect(catsOnly.status).toBe('ONE');
    const emptySolve = puzzleSolver.solve(level, { maxSolutions: 2, timeoutMs: 3000 });
    expect(emptySolve.status).toBe('ONE');
  });

  it('hint still available after excluding a solution cell (excludes ignored)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const board = emptyBoard(level.size);
    board[level.solution![0]!] = 'EXCLUDED';
    const hint = hintService.getHint(level, board);
    expect(hint.status).toBe('AVAILABLE');
  });
});
