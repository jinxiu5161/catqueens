import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import type { SessionSnapshot } from '../../app/GameSession';
import { colOf, rowOf } from '../../core/puzzle/PuzzleTypes';
import { BOARD_THEME, REGION_COLORS } from './BoardTheme';
import { hitTestBoard } from './BoardHitTest';
import { drawCatIcon, drawExcludeIcon } from './CellIcons';
import { presentConflicts } from './ConflictPresenter';

const { ccclass, property } = _decorator;

export type BoardCellHandler = (
  index: number,
  type: 'down' | 'move' | 'up',
  x: number,
  y: number,
) => void;

function hexColor(hex: string): Color {
  const c = new Color();
  c.fromHEX(hex);
  return c;
}

@ccclass('BoardView')
export class BoardView extends Component {
  @property
  boardSizePx = 900;

  private graphics: Graphics | null = null;
  private pieces: Graphics | null = null;
  private overlay: Graphics | null = null;
  private snap: SessionSnapshot | null = null;
  private highlightIndex = -1;
  private pendingTapIndex = -1;
  private hintCells = new Set<number>();
  private coachFocus = new Set<number>();
  private coachTargets = new Set<number>();
  private coachPointer = -1;
  private coachPulse = 0;
  private onPointer: BoardCellHandler | null = null;

  onLoad(): void {
    const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    ui.setContentSize(this.boardSizePx, this.boardSizePx);

    const gNode = new Node('BoardGraphics');
    gNode.layer = this.node.layer;
    gNode.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.graphics = gNode.addComponent(Graphics);
    this.node.addChild(gNode);

    const pNode = new Node('BoardPieces');
    pNode.layer = this.node.layer;
    pNode.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.pieces = pNode.addComponent(Graphics);
    this.node.addChild(pNode);

    const oNode = new Node('BoardOverlay');
    oNode.layer = this.node.layer;
    oNode.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.overlay = oNode.addComponent(Graphics);
    this.node.addChild(oNode);

    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  onDestroy(): void {
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  setPointerHandler(handler: BoardCellHandler): void {
    this.onPointer = handler;
  }

  setHighlight(index: number): void {
    this.highlightIndex = index;
    this.redrawOverlay();
  }

  clearHighlight(): void {
    this.highlightIndex = -1;
    this.redrawOverlay();
  }

  setHintCells(cells: number[]): void {
    this.hintCells = new Set(cells);
    this.redrawOverlay();
  }

  setPendingTap(index: number | null): void {
    this.pendingTapIndex = index == null ? -1 : index;
    this.redrawOverlay();
  }

  /**
   * Interactive technique coach: dim non-focus cells, glow targets, point at pointer.
   * Pass null to clear.
   */
  setCoachSpotlight(
    opts: { focus: number[]; targets: number[]; pointer: number } | null,
  ): void {
    if (!opts) {
      this.coachFocus = new Set();
      this.coachTargets = new Set();
      this.coachPointer = -1;
    } else {
      this.coachFocus = new Set(opts.focus);
      this.coachTargets = new Set(opts.targets);
      this.coachPointer = opts.pointer;
    }
    this.redrawOverlay();
  }

  update(dt: number): void {
    if (this.coachPointer < 0) return;
    this.coachPulse = (this.coachPulse + dt) % 1.2;
    this.redrawOverlay();
  }

  render(snap: SessionSnapshot): void {
    this.snap = snap;
    this.redrawBoard();
    this.redrawPieces();
    this.redrawOverlay();
  }

  hitTest(localX: number, localY: number): number {
    if (!this.snap) return -1;
    return hitTestBoard(localX, localY, this.snap.level.size, this.boardSizePx);
  }

  private redrawBoard(): void {
    if (!this.graphics || !this.snap) return;
    const g = this.graphics;
    g.clear();
    const { level } = this.snap;
    const size = level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;

    g.fillColor = hexColor(BOARD_THEME.boardFrame);
    g.rect(origin - 8, origin - 8, this.boardSizePx + 16, this.boardSizePx + 16);
    g.fill();

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const region = level.regions[idx] ?? 0;
        g.fillColor = hexColor(REGION_COLORS[region % REGION_COLORS.length]!);
        const x = origin + c * cell;
        const y = origin + (size - 1 - r) * cell;
        g.rect(x, y, cell, cell);
        g.fill();

        g.strokeColor = hexColor(BOARD_THEME.gridLine);
        g.lineWidth = 1;
        if (region % 3 === 1) {
          g.moveTo(x + 6, y + 6);
          g.lineTo(x + cell - 6, y + cell - 6);
          g.stroke();
        } else if (region % 3 === 2) {
          g.moveTo(x + cell - 6, y + 6);
          g.lineTo(x + 6, y + cell - 6);
          g.stroke();
        }
      }
    }

    g.strokeColor = hexColor('#1B2A24');
    g.lineWidth = 3;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        const region = level.regions[idx]!;
        const x = origin + c * cell;
        const y = origin + (size - 1 - r) * cell;
        if (c + 1 >= size || level.regions[idx + 1] !== region) {
          g.moveTo(x + cell, y);
          g.lineTo(x + cell, y + cell);
          g.stroke();
        }
        if (r + 1 >= size || level.regions[idx + size] !== region) {
          g.moveTo(x, y);
          g.lineTo(x + cell, y);
          g.stroke();
        }
      }
    }
  }

  /** Cat icon + exclude icon (same visual weight). */
  private redrawPieces(): void {
    if (!this.pieces || !this.snap) return;
    const g = this.pieces;
    g.clear();
    const { board, level } = this.snap;
    const size = level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;

    for (let i = 0; i < size * size; i++) {
      const state = board[i];
      if (state !== 'CAT' && state !== 'EXCLUDED') continue;
      const r = rowOf(i, size);
      const c = colOf(i, size);
      const cx = origin + c * cell + cell / 2;
      const cy = origin + (size - 1 - r) * cell + cell / 2;
      if (state === 'CAT') drawCatIcon(g, cx, cy, cell);
      else drawExcludeIcon(g, cx, cy, cell);
    }
  }

  private redrawOverlay(): void {
    if (!this.overlay || !this.snap) return;
    const g = this.overlay;
    g.clear();
    const { level, validation } = this.snap;
    const size = level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;
    const presented = presentConflicts(validation);

    if (this.coachFocus.size > 0) {
      // Dim non-focus cells (HUD dim is drawn separately by TechniqueGuidePanel).
      g.fillColor = hexColor('rgba(8,12,10,0.72)');
      for (let i = 0; i < size * size; i++) {
        if (this.coachFocus.has(i)) continue;
        const r = rowOf(i, size);
        const c = colOf(i, size);
        const x = origin + c * cell;
        const y = origin + (size - 1 - r) * cell;
        g.rect(x, y, cell, cell);
        g.fill();
      }

      // Soft gold wash across the whole focus band (reference yellow glow).
      for (const idx of this.coachFocus) {
        const r = rowOf(idx, size);
        const c = colOf(idx, size);
        const x = origin + c * cell;
        const y = origin + (size - 1 - r) * cell;
        g.fillColor = hexColor('rgba(244,211,94,0.28)');
        g.rect(x, y, cell, cell);
        g.fill();
        g.strokeColor = hexColor('rgba(244,211,94,0.85)');
        g.lineWidth = 3;
        g.rect(x + 2, y + 2, cell - 4, cell - 4);
        g.stroke();
      }

      // Stronger coral/pink rim on cells the player must exclude.
      for (const idx of this.coachTargets) {
        const r = rowOf(idx, size);
        const c = colOf(idx, size);
        const x = origin + c * cell;
        const y = origin + (size - 1 - r) * cell;
        g.fillColor = hexColor('rgba(232,120,140,0.28)');
        g.rect(x + 4, y + 4, cell - 8, cell - 8);
        g.fill();
        g.strokeColor = hexColor('#E8899A');
        g.lineWidth = 4;
        g.rect(x + 4, y + 4, cell - 8, cell - 8);
        g.stroke();
      }

      if (this.coachPointer >= 0) {
        this.drawCoachHand(g, this.coachPointer, size, cell, origin);
      }
    }

    if (this.highlightIndex >= 0) {
      const hr = rowOf(this.highlightIndex, size);
      const hc = colOf(this.highlightIndex, size);
      const regionId = level.regions[this.highlightIndex]!;
      g.fillColor = hexColor(BOARD_THEME.highlight);
      for (let i = 0; i < size * size; i++) {
        const r = rowOf(i, size);
        const c = colOf(i, size);
        if (r === hr || c === hc || level.regions[i] === regionId) {
          const x = origin + c * cell;
          const y = origin + (size - 1 - r) * cell;
          g.rect(x, y, cell, cell);
          g.fill();
        }
      }
    }

    if (this.pendingTapIndex >= 0) {
      const r = rowOf(this.pendingTapIndex, size);
      const c = colOf(this.pendingTapIndex, size);
      const x = origin + c * cell;
      const y = origin + (size - 1 - r) * cell;
      g.strokeColor = hexColor(BOARD_THEME.accent);
      g.lineWidth = 2;
      g.rect(x + 6, y + 6, cell - 12, cell - 12);
      g.stroke();
    }

    for (const idx of this.hintCells) {
      const r = rowOf(idx, size);
      const c = colOf(idx, size);
      const x = origin + c * cell;
      const y = origin + (size - 1 - r) * cell;
      g.strokeColor = hexColor(BOARD_THEME.hint);
      g.lineWidth = 4;
      g.rect(x + 4, y + 4, cell - 8, cell - 8);
      g.stroke();
    }

    for (const idx of presented.conflictedCells) {
      const r = rowOf(idx, size);
      const c = colOf(idx, size);
      const x = origin + c * cell + cell / 2;
      const y = origin + (size - 1 - r) * cell + cell / 2;
      g.strokeColor = hexColor(BOARD_THEME.conflict);
      g.lineWidth = 3;
      g.circle(x, y, cell * 0.38);
      g.stroke();
    }
  }

  /** Cartoon white glove + tap ripple (reference-style). */
  private drawCoachHand(
    g: Graphics,
    index: number,
    size: number,
    cell: number,
    origin: number,
  ): void {
    const r = rowOf(index, size);
    const c = colOf(index, size);
    const cx = origin + c * cell + cell * 0.55;
    const cy = origin + (size - 1 - r) * cell + cell * 0.22;
    const pulse = 0.82 + 0.18 * Math.sin((this.coachPulse / 1.2) * Math.PI * 2);
    const rad = cell * 0.2 * pulse;

    g.fillColor = hexColor('rgba(255,255,255,0.18)');
    g.circle(cx, cy, rad * 1.55);
    g.fill();
    g.strokeColor = hexColor('rgba(255,255,255,0.9)');
    g.lineWidth = 3;
    g.circle(cx, cy, rad * 1.15);
    g.stroke();
    g.circle(cx, cy, rad * 0.7);
    g.stroke();

    const palmX = cx + cell * 0.06;
    const palmY = cy - cell * 0.08;
    g.fillColor = hexColor('#FFFFFF');
    g.circle(palmX, palmY, cell * 0.17);
    g.fill();
    g.strokeColor = hexColor('rgba(40,40,40,0.25)');
    g.lineWidth = 1.5;
    g.circle(palmX, palmY, cell * 0.17);
    g.stroke();

    for (let i = -1; i <= 2; i++) {
      const fx = palmX + i * cell * 0.075 - cell * 0.04;
      const fy = palmY + cell * 0.1;
      g.fillColor = hexColor('#FFFFFF');
      g.roundRect(fx, fy, cell * 0.07, cell * 0.2, 5);
      g.fill();
    }
    g.fillColor = hexColor('#FFFFFF');
    g.roundRect(palmX - cell * 0.26, palmY - cell * 0.02, cell * 0.16, cell * 0.09, 5);
    g.fill();
  }

  /** Board frame in parent/root space — used to cut dim overlays around the grid. */
  getBoardFrameInParent(): { x: number; y: number; size: number } {
    return {
      x: this.node.position.x,
      y: this.node.position.y,
      size: this.boardSizePx,
    };
  }

  private localFromTouch(e: EventTouch): { x: number; y: number } {
    const transform = this.node.getComponent(UITransform)!;
    const ui = e.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    const half = this.boardSizePx / 2;
    return {
      x: Math.max(-half, Math.min(half - 0.001, local.x)),
      y: Math.max(-half, Math.min(half - 0.001, local.y)),
    };
  }

  private onTouchStart(e: EventTouch): void {
    const { x, y } = this.localFromTouch(e);
    this.onPointer?.(this.hitTest(x, y), 'down', x, y);
  }

  private onTouchMove(e: EventTouch): void {
    const { x, y } = this.localFromTouch(e);
    this.onPointer?.(this.hitTest(x, y), 'move', x, y);
  }

  private onTouchEnd(e: EventTouch): void {
    const { x, y } = this.localFromTouch(e);
    this.onPointer?.(this.hitTest(x, y), 'up', x, y);
  }
}
