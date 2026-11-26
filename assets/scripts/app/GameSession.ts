import { hintService } from '../core/hint/HintService';
import type { HintResult } from '../core/hint/HintTypes';
import type { LevelRepository } from '../core/level/LevelRepository';
import { achievementService } from '../core/meta/AchievementService';
import { catBookService } from '../core/meta/CatBookService';
import { ticketService } from '../core/meta/TicketService';
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
  eliteFailed: boolean;
  /** True when CAT+EXCLUDED constraints admit zero solutions (level itself still has a unique sol). */
  currentStateUnsolvable: boolean;
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
  private mode: SessionMode = 'soft';
  private lastHint: HintResult | null = null;
  private won = false;
  private eliteFailed = false;
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
    this.hintsUsedThisLevel = 0;

    // Spec: default soft; elite levels honor settings.softMode (false => strict)
    this.mode = level.elite && !this.save.settings.softMode ? 'strict' : 'soft';

    if (
      this.save.currentRun &&
      this.save.currentRun.levelId === levelId &&
      this.save.currentRun.cells.length === level.size * level.size
    ) {
      this.board = [...this.save.currentRun.cells];
      // Bad mid-run marks (e.g. × on the only solution cell) feel like a broken level.
      // If the restored board is already unsolvable, start clean.
      if (this.isBoardUnsolvable(this.board)) {
        this.board = emptyBoard(level.size);
        this.save.currentRun = undefined;
      }
    } else {
      this.board = emptyBoard(level.size);
    }

    this.persistRun();
    return this.emit();
  }

  getSnapshot(): SessionSnapshot {
    return this.buildSnapshot();
  }

  setSoftMode(soft: boolean): SessionSnapshot {
    this.save.settings.softMode = soft;
    if (this.level.elite) this.mode = soft ? 'soft' : 'strict';
    saveService.save(this.save);
    return this.emit();
  }

  /** Apply a single-cell toggle for tap (EMPTY <-> EXCLUDED). CAT ignored. */
  applyTap(index: number): SessionSnapshot {
    if (this.won || !this.inBounds(index)) return this.emit();
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
   * If the cell is EXCLUDED, clear the exclude icon and place a cat in one step
   * so players can revise notes while hunting for the next cat.
   */
  applyDoubleTap(index: number): SessionSnapshot {
    if (this.won || !this.inBounds(index)) return this.emit();
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

    if (this.mode === 'strict' && !validation.isValidSoFar) {
      this.eliteFailed = true;
      this.save.stats.eliteFailures += 1;
      saveService.save(this.save);
      return this.emit();
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
    this.swipeActive = true;
    this.swipeLastIndex = -1;
    this.swipeStartBoard = [...this.board];
  }

  /**
   * Live paint as the finger enters a cell:
   * - EMPTY → EXCLUDED
   * - EXCLUDED → EMPTY (swipe back clears exclude)
   * - CAT → unchanged
   * Re-entering a cell in the same stroke toggles again.
   */
  paintSwipeExclude(index: number): SessionSnapshot {
    if (this.won || !this.swipeActive || !this.inBounds(index)) return this.emit();
    // Stay on same cell: do not flip repeatedly while finger jitters inside it
    if (index === this.swipeLastIndex) return this.emit();
    this.swipeLastIndex = index;

    const cur = this.board[index]!;
    if (cur === 'CAT') return this.emit();
    if (cur === 'EMPTY') this.board[index] = 'EXCLUDED';
    else if (cur === 'EXCLUDED') this.board[index] = 'EMPTY';
    else return this.emit();

    this.eliteFailed = false;
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
    const cmd = this.undoStack.pop();
    if (!cmd) return this.emit();
    this.applyStates(cmd.before);
    this.redoStack.push(cmd);
    this.save.stats.undos += 1;
    this.eliteFailed = false;
    this.persistRun();
    return this.emit();
  }

  redo(): SessionSnapshot {
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
    let charged = false;
    if (hint.status === 'AVAILABLE') {
      // Spec: deduct when player confirms use of a usable hint — charge on confirmApplyHint
      // Here we only preview.
    }
    return { snap: this.emit(), hint, charged };
  }

  confirmApplyHint(): SessionSnapshot {
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
    this.board = emptyBoard(this.level.size);
    this.undoStack = [];
    this.redoStack = [];
    this.won = false;
    this.eliteFailed = false;
    this.lastHint = null;
    this.persistRun();
    return this.emit();
  }

  private applyCommand(cmd: BoardCommand): SessionSnapshot {
    this.applyStates(cmd.after);
    this.undoStack.push(cmd);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.eliteFailed = false;

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
    if (this.won) {
      this.save.currentRun = undefined;
    } else {
      this.save.currentRun = {
        levelId: this.level.id,
        cells: [...this.board],
        updatedAt: Date.now(),
      };
    }
    saveService.save(this.save);
  }

  private inBounds(index: number): boolean {
    return index >= 0 && index < this.level.size * this.level.size;
  }

  private isBoardUnsolvable(board: CellState[]): boolean {
    const result = puzzleSolver.solveFromBoard(this.level, board, {
      maxSolutions: 1,
      timeoutMs: 1200,
    });
    return result.status === 'ZERO';
  }

  private buildSnapshot(): SessionSnapshot {
    const validation = puzzleValidator.validateBoard(this.level, catsFromBoard(this.board));
    const currentStateUnsolvable =
      !this.won && !validation.isSolved && this.isBoardUnsolvable(this.board);
    return {
      level: this.level,
      board: [...this.board],
      validation,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      mode: this.mode,
      tickets: this.save.economy.tickets,
      pendingTickets: this.save.economy.pendingTicketRewards,
      lastHint: this.lastHint,
      won: this.won,
      eliteFailed: this.eliteFailed,
      currentStateUnsolvable,
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
