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
import { GameSession, type SessionSnapshot } from './GameSession';
import { SceneRouter } from './SceneRouter';

import { STARTER_LEVELS } from '../data/StarterLevels';

const { ccclass } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
  private session!: GameSession;
  private boardView!: BoardView;
  private hud!: GameHUD;
  private actionBar!: ActionBar;
  private failPanel!: FailRevivePanel;
  private input!: BoardInputController;
  private message = '';
  private levels = new LevelRepository();
  private reviveBusy = false;

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
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.applyTap(i);
      },
      onDoubleTap: (i) => {
        if (!this.session.canAcceptInput()) return;
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.applyDoubleTap(i);
      },
      onSwipeBegin: () => {
        if (!this.session.canAcceptInput()) return;
        this.message = '';
        this.boardView.setPendingTap(null);
        this.session.beginSwipeExclude();
      },
      onSwipePaint: (i) => {
        this.session.paintSwipeExclude(i);
      },
      onSwipeEnd: () => {
        this.session.endSwipeExclude();
      },
      onLongPress: (i) => this.boardView.setHighlight(i),
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
        this.message = '';
        this.session.undo();
      },
      onRedo: () => this.session.redo(),
      onHint: () => this.handleHint(),
      onClear: () => {
        this.message = '';
        this.boardView.setHintCells([]);
        this.session.clearBoard();
      },
      onNext: () => this.goNext(),
      onApplyHint: () => {
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
        this.session.retryLevel();
      },
    });

    const save = saveService.load();
    const startId = save.progress.currentLevelId || 1;
    const snap = this.session.start(this.levels.getById(startId) ? startId : 1, save);
    const hasMarks = snap.board.some((c) => c !== 'EMPTY');
    if (!hasMarks && !snap.noStamina && !snap.levelFailed) {
      this.message = i18n.t('board.tip_exclude');
    }
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
    this.message = '';
    this.session.start(next, this.session.getSave());
  }

  private onSession(snap: SessionSnapshot): void {
    this.boardView.render(snap);
    let msg = this.message;
    if (snap.won) msg = i18n.t('win.title');
    else if (snap.needsRevive) msg = i18n.t('revive.title');
    else if (snap.noStamina) msg = i18n.t('stamina.empty_title');
    else if (snap.levelFailed) msg = i18n.t('fail.title');
    else if (snap.lastWrongPlace) msg = i18n.t('heart.lost', { n: snap.hearts });
    else if (snap.currentStateUnsolvable) msg = i18n.t('board.unsolvable');
    else if (snap.validation.conflicts[0]) msg = i18n.t(snap.validation.conflicts[0].messageKey);
    this.message = msg;
    this.hud.render(snap, msg);
    this.failPanel.render(snap);
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
  }

  /** Optional: jump menu */
  backToMenu(): void {
    SceneRouter.load('MainMenu');
  }
}
