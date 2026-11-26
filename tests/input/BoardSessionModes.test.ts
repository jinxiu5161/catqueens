import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../assets/scripts/app/GameSession';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { LevelRepository } from '../../assets/scripts/core/level/LevelRepository';
import { GameConfig } from '../../assets/scripts/core/meta/GameConfig';
import { MemoryStorageAdapter } from '../../assets/scripts/core/save/StorageAdapter';
import { saveService } from '../../assets/scripts/core/save/SaveService';
import { createDefaultSave } from '../../assets/scripts/core/save/SaveTypes';
import { presentConflicts } from '../../assets/scripts/ui/board/ConflictPresenter';

const pack = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

function freshSession(softMode: boolean, stamina = GameConfig.staminaMax): GameSession {
  saveService.setStorage(new MemoryStorageAdapter());
  const save = createDefaultSave();
  save.settings.softMode = softMode;
  save.economy.stamina = stamina;
  saveService.save(save);
  const repo = new LevelRepository();
  const level = { ...pack.levels[0]! };
  repo.load({ schemaVersion: 1, levels: [level] }, { requireUnique: true });
  const session = new GameSession(repo);
  session.start(level.id, save);
  return session;
}

describe('GameSession board modes (strict hearts / soft / stamina)', () => {
  it('defaults to strict and softMode=false in fresh save', () => {
    const save = createDefaultSave();
    expect(save.settings.softMode).toBe(false);
    expect(save.economy.stamina).toBe(GameConfig.staminaMax);
  });

  it('soft mode allows conflicting cat and exposes derived conflicts', () => {
    const session = freshSession(true);
    let snap = session.applyDoubleTap(0);
    snap = session.applyDoubleTap(1);
    expect(snap.board[0]).toBe('CAT');
    expect(snap.board[1]).toBe('CAT');
    expect(snap.validation.isValidSoFar).toBe(false);
    expect(snap.validation.conflicts.some((c) => c.type === 'ROW')).toBe(true);
    expect(snap.eliteFailed).toBe(false);
    expect(snap.hearts).toBe(GameConfig.heartsPerLevel);
    const presented = presentConflicts(snap.validation);
    expect(presented.conflictedCells).toContain(0);
    expect(presented.conflictedCells).toContain(1);
  });

  it('strict mode rejects wrong place, deducts a heart, does not write board', () => {
    const session = freshSession(false);
    let snap = session.applyDoubleTap(0);
    expect(snap.board[0]).toBe('CAT');
    expect(snap.hearts).toBe(GameConfig.heartsPerLevel);
    snap = session.applyDoubleTap(1);
    expect(snap.board[1]).toBe('EMPTY');
    expect(snap.lastWrongPlace).toBe(true);
    expect(snap.hearts).toBe(GameConfig.heartsPerLevel - 1);
    expect(snap.needsRevive).toBe(false);
    expect(snap.canUndo).toBe(true);
  });

  it('strict: hearts deplete then needsRevive; giveUp consumes stamina', () => {
    const session = freshSession(false);
    // Place one valid cat, then wrong placements until hearts = 0
    session.applyDoubleTap(0);
    let snap = session.applyDoubleTap(1); // heart 1
    expect(snap.hearts).toBe(1);
    snap = session.applyDoubleTap(1); // heart 0 → revive
    expect(snap.hearts).toBe(0);
    expect(snap.needsRevive).toBe(true);
    expect(snap.levelFailed).toBe(false);

    const staminaBefore = snap.stamina;
    snap = session.giveUp();
    expect(snap.needsRevive).toBe(false);
    expect(snap.levelFailed).toBe(true);
    expect(snap.stamina).toBe(staminaBefore - GameConfig.staminaCostOnFail);
  });

  it('strict: reviveWithAd restores hearts up to maxRevives', async () => {
    const session = freshSession(false);
    session.applyDoubleTap(0);
    session.applyDoubleTap(1);
    let snap = session.applyDoubleTap(1);
    expect(snap.needsRevive).toBe(true);

    snap = await session.reviveWithAd();
    expect(snap.needsRevive).toBe(false);
    expect(snap.hearts).toBe(GameConfig.heartsAfterRevive);
    expect(snap.revivesUsed).toBe(1);

    // Burn hearts again
    session.applyDoubleTap(1);
    snap = session.applyDoubleTap(1);
    expect(snap.needsRevive).toBe(true);
    snap = await session.reviveWithAd();
    expect(snap.revivesUsed).toBe(2);

    // Third deplete: no revive left → fail + stamina
    session.applyDoubleTap(1);
    snap = session.applyDoubleTap(1);
    expect(snap.needsRevive).toBe(false);
    expect(snap.levelFailed).toBe(true);
  });

  it('blocks start when stamina is 0', () => {
    const session = freshSession(false, 0);
    const snap = session.getSnapshot();
    expect(snap.noStamina).toBe(true);
    expect(snap.levelFailed).toBe(true);
  });

  it('tap toggles exclude icon; double-tap on exclude places cat; swipe skips cats', () => {
    const session = freshSession(true);
    let snap = session.applyTap(2);
    expect(snap.board[2]).toBe('EXCLUDED');
    snap = session.applyTap(2);
    expect(snap.board[2]).toBe('EMPTY');

    snap = session.applyTap(3);
    expect(snap.board[3]).toBe('EXCLUDED');
    snap = session.applyDoubleTap(3);
    expect(snap.board[3]).toBe('CAT');
    snap = session.applyDoubleTap(3);
    expect(snap.board[3]).toBe('EMPTY');

    snap = session.applyDoubleTap(5);
    expect(snap.board[5]).toBe('CAT');
    session.beginSwipeExclude();
    snap = session.paintSwipeExclude(4);
    expect(snap.board[4]).toBe('EXCLUDED');
    snap = session.paintSwipeExclude(5);
    expect(snap.board[5]).toBe('CAT');
    snap = session.paintSwipeExclude(6);
    expect(snap.board[6]).toBe('EXCLUDED');
    snap = session.paintSwipeExclude(4);
    expect(snap.board[4]).toBe('EMPTY');
    snap = session.endSwipeExclude();
    expect(snap.board[4]).toBe('EMPTY');
    expect(snap.board[6]).toBe('EXCLUDED');
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
