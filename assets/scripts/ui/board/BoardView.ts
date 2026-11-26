import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Label,
  Node,
  UITransform,
  Vec3,
} from 'cc';
import type { SessionSnapshot } from '../../app/GameSession';
import { colOf, rowOf } from '../../core/puzzle/PuzzleTypes';
import { BOARD_THEME, REGION_COLORS } from './BoardTheme';

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
  private overlay: Graphics | null = null;
  private labelRoot: Node | null = null;
  private cellLabels: Label[] = [];
  private snap: SessionSnapshot | null = null;
  private highlightIndex = -1;
  private hintCells = new Set<number>();
  private onPointer: BoardCellHandler | null = null;

  onLoad(): void {
    const ui = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    ui.setContentSize(this.boardSizePx, this.boardSizePx);

    const gNode = new Node('BoardGraphics');
    gNode.layer = this.node.layer;
    gNode.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.graphics = gNode.addComponent(Graphics);
    this.node.addChild(gNode);

    const oNode = new Node('BoardOverlay');
    oNode.layer = this.node.layer;
    oNode.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.overlay = oNode.addComponent(Graphics);
    this.node.addChild(oNode);

    this.labelRoot = new Node('CellLabels');
    this.labelRoot.layer = this.node.layer;
    this.labelRoot.addComponent(UITransform).setContentSize(this.boardSizePx, this.boardSizePx);
    this.node.addChild(this.labelRoot);

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

  render(snap: SessionSnapshot): void {
    this.snap = snap;
    this.ensureLabels(snap.level.size);
    this.redrawBoard();
    this.redrawOverlay();
    this.refreshLabels();
  }

  hitTest(localX: number, localY: number): number {
    if (!this.snap) return -1;
    const size = this.snap.level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;
    const col = Math.floor((localX - origin) / cell);
    const row = Math.floor((this.boardSizePx / 2 - localY) / cell);
    if (row < 0 || col < 0 || row >= size || col >= size) return -1;
    return row * size + col;
  }

  private ensureLabels(size: number): void {
    if (!this.labelRoot) return;
    const need = size * size;
    while (this.cellLabels.length < need) {
      const n = new Node(`cell_${this.cellLabels.length}`);
      n.layer = this.node.layer;
      n.addComponent(UITransform).setContentSize(48, 48);
      const label = n.addComponent(Label);
      label.string = '';
      label.fontSize = 28;
      label.color = hexColor(BOARD_THEME.excluded);
      this.labelRoot.addChild(n);
      this.cellLabels.push(label);
    }
    for (let i = 0; i < this.cellLabels.length; i++) {
      this.cellLabels[i]!.node.active = i < need;
    }
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

  private redrawOverlay(): void {
    if (!this.overlay || !this.snap) return;
    const g = this.overlay;
    g.clear();
    const { level, validation } = this.snap;
    const size = level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;

    const conflicted = new Set<number>();
    for (const c of validation.conflicts) for (const i of c.cells) conflicted.add(i);

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

    for (const idx of conflicted) {
      const r = rowOf(idx, size);
      const c = colOf(idx, size);
      const x = origin + c * cell + cell / 2;
      const y = origin + (size - 1 - r) * cell + cell / 2;
      g.strokeColor = hexColor(BOARD_THEME.conflict);
      g.lineWidth = 3;
      g.circle(x, y, cell * 0.32);
      g.stroke();
    }
  }

  private refreshLabels(): void {
    if (!this.snap) return;
    const { board, level } = this.snap;
    const size = level.size;
    const cell = this.boardSizePx / size;
    const origin = -this.boardSizePx / 2;
    for (let i = 0; i < size * size; i++) {
      const label = this.cellLabels[i];
      if (!label) continue;
      const r = rowOf(i, size);
      const c = colOf(i, size);
      const x = origin + c * cell + cell / 2;
      const y = origin + (size - 1 - r) * cell + cell / 2;
      label.node.setPosition(new Vec3(x, y, 0));
      const state = board[i];
      if (state === 'CAT') {
        label.string = '猫';
        label.color = hexColor('#1B2A24');
        label.fontSize = Math.max(18, Math.floor(cell * 0.35));
      } else if (state === 'EXCLUDED') {
        label.string = '×';
        label.color = hexColor(BOARD_THEME.excluded);
        label.fontSize = Math.max(18, Math.floor(cell * 0.4));
      } else {
        label.string = '';
      }
    }
  }

  private localFromTouch(e: EventTouch): { x: number; y: number } {
    const ui = e.getUILocation();
    const transform = this.node.getComponent(UITransform)!;
    const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
    return { x: local.x, y: local.y };
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
