import { hintService } from '../core/hint/HintService';
import type { HintResult } from '../core/hint/HintTypes';
import type { LevelRepository } from '../core/level/LevelRepository';
import { achievementService } from '../core/meta/AchievementService';
import { catBookService } from '../core/meta/CatBookService';
import { GameConfig } from '../core/meta/GameConfig';
import { ticketService } from '../core/meta/TicketService';
import { platformService } from '../core/platform/PlatformService';
import type { BoardCommand, BoardValidation, CellState, LevelDefinition } from '../core/puzzle/PuzzleTypes';
import { catsFromBoard, emptyBoard } from '../core/puzzle/PuzzleTypes';
import { puzzleSolver } from '../core/puzzle/PuzzleSolver';
import { puzzleValidator } from '../core/puzzle/PuzzleValidator';
import type { SaveDataV1 } from '../core/save/SaveTypes';
import { saveService } from '../core/save/SaveService';

export type SessionMode = 'soft' | 'strict';

export interface SessionSnapshot {
  level: LevelDefinition;
  board: CellState[];
  validation: BoardValidation;
  canUndo: boolean;
  canRedo: boolean;
  mode: SessionMode;
  tickets: number;
  pendingTickets: number;
  lastHint: HintResult | null;
  won: boolean;
  /** @deprecated Prefer needsRevive / levelFailed / lastWrongPlace */
  eliteFailed: boolean;
  /**
   * Legacy flag — always false.
   * EXCLUDED notes must not tip “无解”; wrong cats are rejected in strict mode instead.
   */
  currentStateUnsolvable: boolean;
  /** Remaining red hearts this attempt. */
  hearts: number;
  heartsMax: number;
  /** Stamina pool. */
  stamina: number;
  staminaMax: number;
  /** Ad revives already used this attempt. */
  revivesUsed: number;
  maxRevives: number;
  /** Hearts depleted — waiting for ad revive or give-up. */
  needsRevive: boolean;
  /** Attempt ended after hearts out + no revive; stamina already consumed. */
  levelFailed: boolean;
  /** Last action was a rejected (wrong) cat placement. */
  lastWrongPlace: boolean;
  /** True when start() was refused due to no stamina. */
  noStamina: boolean;
}

export type SessionListener = (snap: SessionSnapshot) => void;

/**
 * Coordinates level state, undo/redo, hints, win flow and persistence.
 * No rendering / no `cc` imports.
 */
export class GameSession {
  private level!: LevelDefinition;
  private board: CellState[] = [];
  private undoStack: BoardCommand[] = [];
  private redoStack: BoardCommand[] = [];
  private mode: SessionMode = 'strict';
  private lastHint: HintResult | null = null;
  private won = false;
  private eliteFailed = false;
  private hearts = GameConfig.heartsPerLevel;
  private revivesUsed = 0;
  private needsRevive = false;
  private levelFailed = false;
  private lastWrongPlace = false;
  private noStamina = false;
  private hintsUsedThisLevel = 0;
  private listeners = new Set<SessionListener>();
  private save!: SaveDataV1;

  constructor(private readonly levels: LevelRepository) {}

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(levelId: number, save?: SaveDataV1): SessionSnapshot {
    const level = this.levels.getById(levelId);
    if (!level) throw new Error(`Level not found: ${levelId}`);
    this.level = level;
    this.save = save ?? saveService.load();
    this.save.progress.currentLevelId = levelId;
    this.undoStack = [];
    this.redoStack = [];
    this.lastHint = null;
    this.won = false;
    this.eliteFailed = false;
    this.needsRevive = false;
    this.levelFailed = false;
    this.lastWrongPlace = false;
    this.noStamina = false;
    this.hintsUsedThisLevel = 0;

    // Default strict for all levels; softMode setting opts into soft guidance.
    this.mode = this.save.settings.softMode ? 'soft' : 'strict';

    const restoring =
      !!this.save.currentRun &&
      this.save.currentRun.levelId === levelId &&
      this.save.currentRun.cells.length === level.size * level.size;

    if (restoring) {
      this.board = [...this.save.currentRun!.cells];
      this.hearts =
        this.save.currentRun!.hearts ?? GameConfig.heartsPerLevel;
      this.revivesUsed = this.save.currentRun!.revivesUsed ?? 0;
      if (this.hearts <= 0) {
        this.hearts = 0;
        this.needsRevive = this.revivesUsed < GameConfig.maxRevivesPerLevel;
        if (!this.needsRevive) {
          // Already out of hearts and revives — treat as failed attempt on restore
          this.failAttempt();
          return this.emit();
        }
      }
      // Excludes are soft notes — never wipe a run for exclude-based “无解”.
      // Only reset if already-placed cats alone make the level impossible.
      if (this.areCatsUnsolvable(this.board)) {
        this.board = emptyBoard(level.size);
        this.hearts = GameConfig.heartsPerLevel;
        this.revivesUsed = 0;
        this.needsRevive = false;
        this.save.currentRun = undefined;
      }
    } else {
      // Fresh attempt requires stamina
      if (this.save.economy.stamina <= 0) {
        this.board = emptyBoard(level.size);
        this.hearts = 0;
        this.revivesUsed = 0;
        this.noStamina = true;
        this.levelFailed = true;
        saveService.save(this.save);
        return this.emit();
      }
      this.board = emptyBoard(level.size);
      this.hearts = GameConfig.heartsPerLevel;
      this.revivesUsed = 0;
    }

    this.persistRun();
    return this.emit();
  }

  getSnapshot(): SessionSnapshot {
    return this.buildSnapshot();
  }

  setSoftMode(soft: boolean): SessionSnapshot {
    this.save.settings.softMode = soft;
    this.mode = soft ? 'soft' : 'strict';
    saveService.save(this.save);
    return this.emit();
  }

  /** Input blocked during win / revive prompt / failed attempt / no stamina. */
  canAcceptInput(): boolean {
    return !this.won && !this.needsRevive && !this.levelFailed && !this.noStamina;
  }

  /** Apply a single-cell toggle for tap (EMPTY <-> EXCLUDED). CAT ignored. */
  applyTap(index: number): SessionSnapshot {
    if (!this.canAcceptInput() || !this.inBounds(index)) return this.emit();
    this.lastWrongPlace = false;
    const cur = this.board[index]!;
    if (cur === 'CAT') return this.emit();
    const next: CellState = cur === 'EMPTY' ? 'EXCLUDED' : 'EMPTY';
    return this.applyCommand({
      type: 'SET_CELL_STATE',
      before: [{ index, state: cur }],
      after: [{ index, state: next }],
      timestamp: Date.now(),
    });
  }

  /**
   * Double-tap: place/remove cat.
   * Strict mode: wrong placement deducts a red heart and does not write the board.
   */
  applyDoubleTap(index: number): SessionSnapshot {
    if (!this.canAcceptInput() || !this.inBounds(index)) return this.emit();
    this.lastWrongPlace = false;
    const cur = this.board[index]!;

    if (cur === 'CAT') {
      return this.applyCommand({
        type: 'REMOVE_CAT',
        before: [{ index, state: 'CAT' }],
        after: [{ index, state: 'EMPTY' }],
        timestamp: Date.now(),
      });
    }

    // EMPTY or EXCLUDED → CAT (exclude mark removed when placing)
    const beforeState = cur;
    const afterBoard = [...this.board];
    afterBoard[index] = 'CAT';
    const trialCats = catsFromBoard(afterBoard);
    const validation = puzzleValidator.validateBoard(this.level, trialCats);

    if (this.mode === 'strict') {
      // Rule conflict OR cats-only unsolvable (ignores EXCLUDED notes) → wrong place
      if (!validation.isValidSoFar || this.areCatsUnsolvable(afterBoard)) {
        return this.penalizeWrongPlace();
      }
    }

    return this.applyCommand({
      type: 'PLACE_CAT',
      before: [{ index, state: beforeState }],
      after: [{ index, state: 'CAT' }],
      timestamp: Date.now(),
    });
  }

  private swipeActive = false;
  private swipeLastIndex = -1;
  /** Board snapshot at stroke start — used to build one undo command with net diffs. */
  private swipeStartBoard: CellState[] | null = null;

  /** Start a swipe stroke (one undo command for the whole stroke). */
  beginSwipeExclude(): void {
    if (!this.canAcceptInput()) return;
    this.swipeActive = true;
    this.swipeLastIndex = -1;
    this.swipeStartBoard = [...this.board];
  }

  /**
   * Live paint as the finger enters a cell:
   * - EMPTY → EXCLUDED
   * - EXCLUDED → EMPTY (swipe back clears exclude)
   * - CAT → unchanged
   */
  paintSwipeExclude(index: number): SessionSnapshot {
    if (!this.canAcceptInput() || !this.swipeActive || !this.inBounds(index)) {
      return this.emit();
    }
    if (index === this.swipeLastIndex) return this.emit();
    this.swipeLastIndex = index;

    const cur = this.board[index]!;
    if (cur === 'CAT') return this.emit();
    if (cur === 'EMPTY') this.board[index] = 'EXCLUDED';
    else if (cur === 'EXCLUDED') this.board[index] = 'EMPTY';
    else return this.emit();

    this.eliteFailed = false;
    this.lastWrongPlace = false;
    return this.emit();
  }

  /** Finish swipe: commit net changes vs stroke start as one command. */
  endSwipeExclude(): SessionSnapshot {
    if (!this.swipeActive) return this.emit();
    this.swipeActive = false;
    const start = this.swipeStartBoard;
    this.swipeStartBoard = null;
    this.swipeLastIndex = -1;
    if (!start) return this.emit();

    const before: BoardCommand['before'] = [];
    const after: BoardCommand['after'] = [];
    for (let i = 0; i < this.board.length; i++) {
      if (start[i] === this.board[i]) continue;
      before.push({ index: i, state: start[i]! });
      after.push({ index: i, state: this.board[i]! });
    }
    if (after.length === 0) return this.emit();

    this.undoStack.push({
      type: 'BULK_EXCLUDE',
      before,
      after,
      timestamp: Date.now(),
    });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.persistRun();
    return this.emit();
  }

  /**
   * Batch path (tests): visit indexes in order with toggle semantics; CAT skipped.
   */
  applySwipeExclude(indexes: number[]): SessionSnapshot {
    this.beginSwipeExclude();
    for (const index of indexes) this.paintSwipeExclude(index);
    return this.endSwipeExclude();
  }

  undo(): SessionSnapshot {
    if (!this.canAcceptInput()) return this.emit();
    const cmd = this.undoStack.pop();
    if (!cmd) return this.emit();
    this.applyStates(cmd.before);
    this.redoStack.push(cmd);
    this.save.stats.undos += 1;
    this.eliteFailed = false;
    this.lastWrongPlace = false;
    this.persistRun();
    return this.emit();
  }

  redo(): SessionSnapshot {
    if (!this.canAcceptInput()) return this.emit();
    const cmd = this.redoStack.pop();
    if (!cmd) return this.emit();
    this.applyStates(cmd.after);
    this.undoStack.push(cmd);
    this.persistRun();
    return this.emit();
  }

  requestHint(): { snap: SessionSnapshot; hint: HintResult; charged: boolean } {
    const hint = hintService.getHint(this.level, this.board);
    this.lastHint = hint;
    return { snap: this.emit(), hint, charged: false };
  }

  confirmApplyHint(): SessionSnapshot {
    if (!this.canAcceptInput()) return this.emit();
    if (!this.lastHint || this.lastHint.status !== 'AVAILABLE' || !this.lastHint.suggestedAction) {
      return this.emit();
    }
    if (!ticketService.canUse(this.save)) return this.emit();
    ticketService.consume(this.save);
    this.save.stats.hintsUsed += 1;
    this.hintsUsedThisLevel += 1;
    const cmd = this.lastHint.suggestedAction;
    this.lastHint = null;
    return this.applyCommand(cmd);
  }

  clearBoard(): SessionSnapshot {
    if (!this.canAcceptInput()) return this.emit();
    this.board = emptyBoard(this.level.size);
    this.undoStack = [];
    this.redoStack = [];
    this.won = false;
    this.eliteFailed = false;
    this.lastWrongPlace = false;
    this.lastHint = null;
    this.persistRun();
    return this.emit();
  }

  /** Watch rewarded ad to restore hearts (max GameConfig.maxRevivesPerLevel). */
  async reviveWithAd(): Promise<SessionSnapshot> {
    if (!this.needsRevive) return this.emit();
    if (this.revivesUsed >= GameConfig.maxRevivesPerLevel) {
      return this.giveUp();
    }
    const result = await platformService.showRewarded('ELITE_RETRY');
    if (result !== 'COMPLETED') {
      // Keep revive panel open so player can try again or give up
      return this.emit();
    }
    this.revivesUsed += 1;
    this.hearts = GameConfig.heartsAfterRevive;
    this.needsRevive = false;
    this.eliteFailed = false;
    this.lastWrongPlace = false;
    this.bumpAdDayEliteRetry();
    this.persistRun();
    return this.emit();
  }

  /** Decline revive: consume stamina and end the attempt. */
  giveUp(): SessionSnapshot {
    if (this.levelFailed) return this.emit();
    this.needsRevive = false;
    this.failAttempt();
    return this.emit();
  }

  /** Retry current level after failure (requires stamina). */
  retryLevel(): SessionSnapshot {
    return this.start(this.level.id, this.save);
  }

  private penalizeWrongPlace(): SessionSnapshot {
    this.lastWrongPlace = true;
    this.eliteFailed = true;
    this.save.stats.eliteFailures += 1;
    this.hearts = Math.max(0, this.hearts - 1);

    if (this.hearts <= 0) {
      this.hearts = 0;
      if (this.revivesUsed < GameConfig.maxRevivesPerLevel) {
        this.needsRevive = true;
        this.persistRun();
        return this.emit();
      }
      // No revive left — consume stamina immediately
      this.failAttempt();
      return this.emit();
    }

    this.persistRun();
    return this.emit();
  }

  private failAttempt(): void {
    this.levelFailed = true;
    this.needsRevive = false;
    this.eliteFailed = true;
    const cost = GameConfig.staminaCostOnFail;
    this.save.economy.stamina = Math.max(0, this.save.economy.stamina - cost);
    this.save.currentRun = undefined;
    saveService.save(this.save);
  }

  private bumpAdDayEliteRetry(): void {
    const day = new Date().toISOString().slice(0, 10);
    if (!this.save.adDay || this.save.adDay.day !== day) {
      this.save.adDay = {
        day,
        ticketRewarded: 0,
        eliteRetryRewarded: 0,
        interstitialShown: 0,
      };
    }
    this.save.adDay.eliteRetryRewarded += 1;
  }

  private applyCommand(cmd: BoardCommand): SessionSnapshot {
    this.applyStates(cmd.after);
    this.undoStack.push(cmd);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.eliteFailed = false;
    this.lastWrongPlace = false;

    const validation = puzzleValidator.validateBoard(this.level, catsFromBoard(this.board));
    if (validation.isSolved) {
      this.onWin();
    }
    this.persistRun();
    return this.emit();
  }

  private onWin(): void {
    this.won = true;
    const id = this.level.id;
    const firstClear = !this.save.progress.clearedLevelIds.includes(id);
    if (firstClear) {
      this.save.progress.clearedLevelIds.push(id);
      this.save.stats.clears += 1;
      ticketService.grantMilestoneIfNeeded(this.save, id);
    }
    this.save.progress.maxUnlockedLevel = Math.max(
      this.save.progress.maxUnlockedLevel,
      id + 1,
      this.levels.nextId(id) ?? id,
    );
    if (this.hintsUsedThisLevel === 0) {
      const c = this.save.achievements.counters.noHintClears ?? 0;
      this.save.achievements.counters.noHintClears = c + 1;
    }
    catBookService.syncUnlocks(this.save);
    achievementService.evaluate(this.save);
    this.save.currentRun = undefined;
    saveService.save(this.save);
  }

  private applyStates(states: Array<{ index: number; state: CellState }>): void {
    for (const s of states) this.board[s.index] = s.state;
  }

  private persistRun(): void {
    if (this.won || this.levelFailed) {
      this.save.currentRun = undefined;
    } else {
      this.save.currentRun = {
        levelId: this.level.id,
        cells: [...this.board],
        updatedAt: Date.now(),
        hearts: this.hearts,
        revivesUsed: this.revivesUsed,
      };
    }
    saveService.save(this.save);
  }

  private inBounds(index: number): boolean {
    return index >= 0 && index < this.level.size * this.level.size;
  }

  /** True when fixed CAT cells alone admit zero solutions (EXCLUDED ignored). */
  private areCatsUnsolvable(board: CellState[]): boolean {
    const result = puzzleSolver.solveFromCatsOnly(this.level, board, {
      maxSolutions: 1,
      timeoutMs: 1200,
    });
    return result.status === 'ZERO';
  }

  private buildSnapshot(): SessionSnapshot {
    const validation = puzzleValidator.validateBoard(this.level, catsFromBoard(this.board));
    // Excludes are notes — never surface “当前无解” from EXCLUDED marks.
    // Strict mode rejects unsolvable cat placements before they stick.
    const currentStateUnsolvable = false;
    return {
      level: this.level,
      board: [...this.board],
      validation,
      canUndo: this.undoStack.length > 0 && this.canAcceptInput(),
      canRedo: this.redoStack.length > 0 && this.canAcceptInput(),
      mode: this.mode,
      tickets: this.save.economy.tickets,
      pendingTickets: this.save.economy.pendingTicketRewards,
      lastHint: this.lastHint,
      won: this.won,
      eliteFailed: this.eliteFailed,
      currentStateUnsolvable,
      hearts: this.hearts,
      heartsMax: GameConfig.heartsPerLevel,
      stamina: this.save.economy.stamina,
      staminaMax: this.save.economy.staminaMax,
      revivesUsed: this.revivesUsed,
      maxRevives: GameConfig.maxRevivesPerLevel,
      needsRevive: this.needsRevive,
      levelFailed: this.levelFailed,
      lastWrongPlace: this.lastWrongPlace,
      noStamina: this.noStamina,
    };
  }

  private emit(): SessionSnapshot {
    const snap = this.buildSnapshot();
    for (const l of this.listeners) l(snap);
    return snap;
  }

  getSave(): SaveDataV1 {
    return this.save;
  }
}
