import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../assets/scripts/app/GameSession';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { LevelRepository } from '../../assets/scripts/core/level/LevelRepository';
import { MemoryStorageAdapter } from '../../assets/scripts/core/save/StorageAdapter';
import { saveService } from '../../assets/scripts/core/save/SaveService';
import { createDefaultSave } from '../../assets/scripts/core/save/SaveTypes';
import { presentConflicts } from '../../assets/scripts/ui/board/ConflictPresenter';

const pack = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

/** Use a known unique level and force elite so strict mode can be exercised. */
function freshSession(softMode: boolean): GameSession {
  saveService.setStorage(new MemoryStorageAdapter());
  const save = createDefaultSave();
  save.settings.softMode = softMode;
  saveService.save(save);
  const repo = new LevelRepository();
  const level = { ...pack.levels[0]!, elite: true };
  repo.load({ schemaVersion: 1, levels: [level] }, { requireUnique: true });
  const session = new GameSession(repo);
  session.start(level.id, save);
  return session;
}

describe('GameSession board modes (15.4 soft / strict)', () => {
  it('soft mode allows conflicting cat and exposes derived conflicts', () => {
    const session = freshSession(true);
    // Place two cats in same row → ROW conflict
    let snap = session.applyDoubleTap(0);
    snap = session.applyDoubleTap(1);
    expect(snap.board[0]).toBe('CAT');
    expect(snap.board[1]).toBe('CAT');
    expect(snap.validation.isValidSoFar).toBe(false);
    expect(snap.validation.conflicts.some((c) => c.type === 'ROW')).toBe(true);
    expect(snap.eliteFailed).toBe(false);
    const presented = presentConflicts(snap.validation);
    expect(presented.conflictedCells).toContain(0);
    expect(presented.conflictedCells).toContain(1);
  });

  it('strict mode rejects conflicting placement and does not write board', () => {
    const session = freshSession(false);
    let snap = session.applyDoubleTap(0);
    expect(snap.board[0]).toBe('CAT');
    snap = session.applyDoubleTap(1);
    expect(snap.board[1]).toBe('EMPTY');
    expect(snap.eliteFailed).toBe(true);
    expect(snap.canUndo).toBe(true); // only first place is on stack
  });

  it('tap toggles exclude icon; double-tap on exclude places cat; swipe skips cats', () => {
    const session = freshSession(true);
    let snap = session.applyTap(2);
    expect(snap.board[2]).toBe('EXCLUDED');
    snap = session.applyTap(2);
    expect(snap.board[2]).toBe('EMPTY');

    // Mark exclude then double-tap → cat replaces exclude in one step
    snap = session.applyTap(3);
    expect(snap.board[3]).toBe('EXCLUDED');
    snap = session.applyDoubleTap(3);
    expect(snap.board[3]).toBe('CAT');
    snap = session.applyDoubleTap(3);
    expect(snap.board[3]).toBe('EMPTY');

    // Live swipe: EMPTY shows exclude as soon as painted; CAT never becomes exclude
    snap = session.applyDoubleTap(5);
    expect(snap.board[5]).toBe('CAT');
    session.beginSwipeExclude();
    snap = session.paintSwipeExclude(4);
    expect(snap.board[4]).toBe('EXCLUDED');
    snap = session.paintSwipeExclude(5);
    expect(snap.board[5]).toBe('CAT');
    snap = session.paintSwipeExclude(6);
    expect(snap.board[6]).toBe('EXCLUDED');
    snap = session.endSwipeExclude();
    expect(snap.canUndo).toBe(true);
    snap = session.undo();
    expect(snap.board[4]).toBe('EMPTY');
    expect(snap.board[5]).toBe('CAT');
    expect(snap.board[6]).toBe('EMPTY');
  });

  it('UI conflict presenter does not invent conflicts beyond PuzzleCore', () => {
    const session = freshSession(true);
    const snap = session.applyDoubleTap(0);
    expect(presentConflicts(snap.validation).conflictedCells).toEqual([]);
  });
});
