import { _decorator, Color, Component, Node, UITransform, view } from 'cc';
import { LevelRepository } from '../core/level/LevelRepository';
import { BoardInputController } from '../core/input/BoardInputController';
import { i18n } from '../core/localization/I18n';
import { CocosStorageAdapter } from '../core/save/CocosStorageAdapter';
import { saveService } from '../core/save/SaveService';
import { BoardView } from '../ui/board/BoardView';
import { BOARD_THEME } from '../ui/board/BoardTheme';
import { GameHUD } from '../ui/hud/GameHUD';
import { ActionBar } from '../ui/panels/ActionBar';
import { FailRevivePanel } from '../ui/panels/FailRevivePanel';
import { TechniqueGuidePanel } from '../ui/panels/TechniqueGuidePanel';
import { coachGuideKeyForLevel } from '../core/level/LevelTechniques';
import {
  findLevelCoachPlan,
  nextCoachPointer,
  type CoachStep,
} from '../core/level/TechniqueCoach';
import { GameSession, type SessionSnapshot } from './GameSession';
import { SceneRouter } from './SceneRouter';

import { STARTER_LEVELS } from '../data/StarterLevels';

const { ccclass } = _decorator;

interface CoachRuntime {
  /** Save key: L1 / L3 / T1… */
  guideKey: string;
  steps: CoachStep[];
  stepIndex: number;
  /** Targets completed on the current step. */
  done: Set<number>;
}

@ccclass('GameController')
export class GameController extends Component {
  private session!: GameSession;
  private boardView!: BoardView;
  private hud!: GameHUD;
  private actionBar!: ActionBar;
  private failPanel!: FailRevivePanel;
  private techniqueGuide!: TechniqueGuidePanel;
  private input!: BoardInputController;
  private message = '';
  private levels = new LevelRepository();
  private reviveBusy = false;
  private coach: CoachRuntime | null = null;

  onLoad(): void {
    saveService.setStorage(new CocosStorageAdapter());

    const reports = this.levels.load(STARTER_LEVELS, { requireUnique: true });
    const failed = reports.filter((r) => !r.ok);
    if (failed.length) {
      console.error(
        `[CatQueens] ${failed.length} levels failed unique-solution gate`,
        failed.slice(0, 10),
      );
    }
    console.log(
      `[CatQueens] loaded ${this.levels.count()} uniquely-solvable levels`,
    );

    this.buildUi();
    this.session = new GameSession(this.levels);
    this.session.subscribe((snap) => this.onSession(snap));

    this.input = new BoardInputController({
      hitTest: (x, y) => this.boardView.hitTest(x, y),
      onTap: (i) => {
        if (!this.session.canAcceptInput()) return;
        if (this.coach) {
          this.handleCoachTap(i);
          return;
        }
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.applyTap(i);
      },
      onDoubleTap: (i) => {
        if (!this.session.canAcceptInput()) return;
        if (this.coach) {
          this.handleCoachDoubleTap(i);
          return;
        }
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.applyDoubleTap(i);
      },
      onSwipeBegin: () => {
        if (!this.session.canAcceptInput()) return;
        const step = this.currentCoachStep();
        if (this.coach && step?.action !== 'EXCLUDE') return;
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.beginSwipeExclude();
      },
      onSwipePaint: (i) => {
        if (this.coach) {
          const step = this.currentCoachStep();
          if (!step || step.action !== 'EXCLUDE') return;
          if (!step.targetCells.includes(i)) return;
          if (this.coach.done.has(i)) return;
        }
        this.session.paintSwipeExclude(i);
        if (this.coach) this.syncCoachAfterBoard();
      },
      onSwipeEnd: () => {
        this.session.endSwipeExclude();
        if (this.coach) this.syncCoachAfterBoard();
      },
      onLongPress: (i) => {
        if (this.coach) return;
        this.boardView.setHighlight(i);
      },
      onLongPressEnd: () => this.boardView.clearHighlight(),
      onPendingTap: (i) => this.boardView.setPendingTap(i),
    });

    this.boardView.setPointerHandler((index, type, x, y) => {
      const t = Date.now();
      if (type === 'down') this.input.pointerDown(index, x, y, t);
      else if (type === 'move') this.input.pointerMove(index, x, y, t);
      else this.input.pointerUp(index, x, y, t);
    });

    this.actionBar.setHandlers({
      onUndo: () => {
        if (this.coach) return;
        this.message = '';
        this.session.undo();
      },
      onRedo: () => {
        if (this.coach) return;
        this.session.redo();
      },
      onHint: () => {
        if (this.coach) return;
        this.handleHint();
      },
      onClear: () => {
        if (this.coach) return;
        this.message = '';
        this.boardView.setHintCells([]);
        this.session.clearBoard();
      },
      onNext: () => {
        if (this.coach) return;
        this.goNext();
      },
      onApplyHint: () => {
        if (this.coach) return;
        const snap = this.session.confirmApplyHint();
        this.boardView.setHintCells([]);
        this.actionBar.setApplyVisible(false);
        this.message = '';
        this.onSession(snap);
      },
    });

    this.failPanel.setHandlers({
      onReviveAd: () => void this.handleReviveAd(),
      onGiveUp: () => {
        this.message = '';
        this.session.giveUp();
      },
      onRetry: () => {
        this.message = '';
        this.boardView.setHintCells([]);
        this.actionBar.setApplyVisible(false);
        const snap = this.session.retryLevel();
        this.message = this.defaultTipFor(snap);
        this.maybeStartTechniqueCoach(snap.level.id);
      },
    });

    const save = saveService.load();
    const startId = save.progress.currentLevelId || 1;
    const snap = this.session.start(this.levels.getById(startId) ? startId : 1, save);
    this.message = this.defaultTipFor(snap);
    this.hud.render(snap, this.message);
    this.failPanel.render(snap);
    this.maybeStartTechniqueCoach(snap.level.id);
  }

  onDestroy(): void {
    this.input?.dispose();
  }

  private async handleReviveAd(): Promise<void> {
    if (this.reviveBusy) return;
    this.reviveBusy = true;
    try {
      await this.session.reviveWithAd();
    } finally {
      this.reviveBusy = false;
    }
  }

  private handleHint(): void {
    const { hint } = this.session.requestHint();
    if (hint.status === 'AVAILABLE') {
      this.boardView.setHintCells(hint.targetCells);
      this.actionBar.setApplyVisible(true);
      this.message = i18n.t(hint.explanationKey, hint.explanationArgs);
      if (this.session.getSave().economy.tickets <= 0) {
        this.message = i18n.t('hint.no_ticket');
        this.actionBar.setApplyVisible(false);
      }
    } else {
      this.boardView.setHintCells([]);
      this.actionBar.setApplyVisible(false);
      this.message = i18n.t(hint.explanationKey);
    }
    this.hud.render(this.session.getSnapshot(), this.message);
  }

  private goNext(): void {
    const snap = this.session.getSnapshot();
    const next = this.levels.nextId(snap.level.id);
    if (next == null) {
      this.message = '已通关全部已导入关卡';
      this.hud.render(snap, this.message);
      return;
    }
    this.boardView.setHintCells([]);
    this.actionBar.setApplyVisible(false);
    const nextSnap = this.session.start(next, this.session.getSave());
    this.message = this.defaultTipFor(nextSnap);
    this.hud.render(nextSnap, this.message);
    this.failPanel.render(nextSnap);
    this.maybeStartTechniqueCoach(nextSnap.level.id);
  }

  /** Interactive on-board coach (L1/L3 onboarding + T1–T6 teach); once per guide key. */
  private maybeStartTechniqueCoach(levelId: number): void {
    this.clearCoach();
    const guideKey = coachGuideKeyForLevel(levelId);
    if (!guideKey) return;
    if (this.hasSeenTechniqueGuide(guideKey)) return;
    const level = this.levels.getById(levelId);
    if (!level) return;
    const plan = findLevelCoachPlan(level);
    if (!plan) return;
    const steps = plan.steps.filter((s) => s.targetCells.length > 0);
    if (steps.length === 0) return;

    // Don't interrupt a resumed mid-level run (except L3 seed on a still-empty board).
    const board = this.session.getSnapshot().board;
    const isEmpty = board.every((c) => c === 'EMPTY');
    if (!isEmpty) return;

    if (plan.prePlaceCats.length) {
      this.session.seedTutorialCats(plan.prePlaceCats);
    }

    this.coach = { guideKey, steps, stepIndex: 0, done: new Set() };
    this.techniqueGuide.setBoardFrame(this.boardView.getBoardFrameInParent());
    this.techniqueGuide.show(steps[0]!);
    this.refreshCoachSpotlight();
  }

  private hasSeenTechniqueGuide(guideKey: string): boolean {
    const seen = this.session.getSave().progress.seenTechniqueGuides ?? [];
    return seen.includes(guideKey);
  }

  private markTechniqueGuideSeen(guideKey: string): void {
    const save = this.session.getSave();
    const seen = save.progress.seenTechniqueGuides ?? [];
    if (seen.includes(guideKey)) return;
    save.progress.seenTechniqueGuides = [...seen, guideKey];
    saveService.save(save);
  }

  private clearCoach(): void {
    this.coach = null;
    this.techniqueGuide?.hide();
    this.boardView?.setCoachSpotlight(null);
  }

  private currentCoachStep(): CoachStep | null {
    if (!this.coach) return null;
    return this.coach.steps[this.coach.stepIndex] ?? null;
  }

  private refreshCoachSpotlight(): void {
    const step = this.currentCoachStep();
    if (!this.coach || !step) {
      this.boardView.setCoachSpotlight(null);
      return;
    }
    const { done } = this.coach;
    const pending = step.targetCells.filter((i) => !done.has(i));
    this.boardView.setCoachSpotlight({
      focus: step.focusCells,
      targets: pending,
      pointer: nextCoachPointer(step.targetCells, done),
    });
  }

  private handleCoachTap(index: number): void {
    const step = this.currentCoachStep();
    if (!this.coach || !step || step.action !== 'EXCLUDE') return;
    if (!step.targetCells.includes(index)) return;
    if (this.coach.done.has(index)) return;
    this.boardView.setPendingTap(null);
    this.session.applyTap(index);
    this.syncCoachAfterBoard();
  }

  private handleCoachDoubleTap(index: number): void {
    const step = this.currentCoachStep();
    if (!this.coach || !step || step.action !== 'PLACE_CAT') return;
    if (!step.targetCells.includes(index)) return;
    this.boardView.setPendingTap(null);
    this.session.applyDoubleTap(index);
    this.syncCoachAfterBoard();
  }

  /** Mark completed targets; advance multi-step coach or finish. */
  private syncCoachAfterBoard(): void {
    if (!this.coach) return;
    const step = this.currentCoachStep();
    if (!step) return;
    const board = this.session.getSnapshot().board;
    const { done } = this.coach;
    for (const idx of step.targetCells) {
      if (done.has(idx)) continue;
      if (step.action === 'EXCLUDE' && board[idx] === 'EXCLUDED') done.add(idx);
      if (step.action === 'PLACE_CAT' && board[idx] === 'CAT') done.add(idx);
    }
    if (!step.targetCells.every((i) => done.has(i))) {
      this.refreshCoachSpotlight();
      return;
    }

    // Advance to next step of the lesson, or finish and remember.
    if (this.coach.stepIndex + 1 < this.coach.steps.length) {
      this.coach.stepIndex += 1;
      this.coach.done = new Set();
      const next = this.coach.steps[this.coach.stepIndex]!;
      this.techniqueGuide.show(next);
      this.refreshCoachSpotlight();
      return;
    }

    this.markTechniqueGuideSeen(this.coach.guideKey);
    this.clearCoach();
    this.message = '';
    this.hud.render(this.session.getSnapshot(), this.message);
  }

  /** HUD tip; active coach levels leave tip empty (bubble owns copy). */
  private defaultTipFor(snap: SessionSnapshot): string {
    if (snap.noStamina || snap.levelFailed) return this.message;
    const id = snap.level.id;
    const guideKey = coachGuideKeyForLevel(id);
    if (guideKey && !this.hasSeenTechniqueGuide(guideKey)) return '';
    if (id === 2) return i18n.t('tutorial.2');
    const hasMarks = snap.board.some((c) => c !== 'EMPTY');
    if (!hasMarks) return i18n.t('board.tip_exclude');
    return '';
  }

  private onSession(snap: SessionSnapshot): void {
    this.boardView.render(snap);
    let msg = this.message;
    if (snap.won) msg = i18n.t('win.title');
    else if (snap.needsRevive) msg = i18n.t('revive.title');
    else if (snap.noStamina) msg = i18n.t('stamina.empty_title');
    else if (snap.levelFailed) msg = i18n.t('fail.title');
    else if (snap.lastWrongPlace) msg = i18n.t('heart.lost', { n: snap.hearts });
    else if (snap.validation.conflicts[0]) msg = i18n.t(snap.validation.conflicts[0].messageKey);
    this.message = msg;
    this.hud.render(snap, msg);
    this.failPanel.render(snap);
    if (this.coach) this.refreshCoachSpotlight();
  }

  private buildUi(): void {
    const visible = view.getVisibleSize();
    const root = this.node;
    const ui = root.getComponent(UITransform) || root.addComponent(UITransform);
    ui.setContentSize(visible.width, visible.height);

    const bg = new Node('Background');
    bg.layer = root.layer;
    bg.addComponent(UITransform).setContentSize(visible.width, visible.height);
    root.addChild(bg);
    void BOARD_THEME;
    void Color;

    const boardNode = new Node('Board');
    boardNode.layer = root.layer;
    boardNode.setPosition(0, 40, 0);
    this.boardView = boardNode.addComponent(BoardView);
    const side = Math.min(visible.width * 0.9, visible.height * 0.55, 980);
    this.boardView.boardSizePx = side;
    root.addChild(boardNode);

    const hudNode = new Node('HUD');
    hudNode.layer = root.layer;
    this.hud = hudNode.addComponent(GameHUD);
    root.addChild(hudNode);

    const barNode = new Node('ActionBar');
    barNode.layer = root.layer;
    this.actionBar = barNode.addComponent(ActionBar);
    root.addChild(barNode);

    const failNode = new Node('FailRevive');
    failNode.layer = root.layer;
    this.failPanel = failNode.addComponent(FailRevivePanel);
    root.addChild(failNode);

    const guideNode = new Node('TechniqueGuide');
    guideNode.layer = root.layer;
    this.techniqueGuide = guideNode.addComponent(TechniqueGuidePanel);
    root.addChild(guideNode);
  }

  /** Optional: jump menu */
  backToMenu(): void {
    SceneRouter.load('MainMenu');
  }
}
