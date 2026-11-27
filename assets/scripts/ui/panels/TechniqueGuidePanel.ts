import {
  _decorator,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  UITransform,
  view,
} from 'cc';
import { i18n } from '../../core/localization/I18n';
import type { CoachStep } from '../../core/level/TechniqueCoach';
import { BOARD_THEME, REGION_COLORS } from '../board/BoardTheme';

const { ccclass } = _decorator;

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

/**
 * Reference-style coach chrome: screen dim (HUD/actions), speech bubble with
 * region color chip. Board spotlight / hand live on BoardView.
 * Dim graphics do not use BlockInputEvents — touches pass through to the board.
 */
@ccclass('TechniqueGuidePanel')
export class TechniqueGuidePanel extends Component {
  private root: Node | null = null;
  private dimGfx: Graphics | null = null;
  private bubble: Node | null = null;
  private chipGfx: Graphics | null = null;
  private bodyLabel: Label | null = null;
  private boardFrame: { x: number; y: number; size: number } = { x: 0, y: 40, size: 900 };

  onLoad(): void {
    const visible = view.getVisibleSize();
    this.root = new Node('CoachRoot');
    this.root.layer = this.node.layer;
    this.root.addComponent(UITransform).setContentSize(visible.width, visible.height);
    this.node.addChild(this.root);

    const dimNode = new Node('ScreenDim');
    dimNode.layer = this.node.layer;
    dimNode.addComponent(UITransform).setContentSize(visible.width, visible.height);
    this.dimGfx = dimNode.addComponent(Graphics);
    this.root.addChild(dimNode);

    this.bubble = new Node('Bubble');
    this.bubble.layer = this.node.layer;
    this.bubble.addComponent(UITransform).setContentSize(600, 160);
    this.bubble.setPosition(0, 420, 0);
    this.root.addChild(this.bubble);

    const bg = new Node('BubbleBg');
    bg.layer = this.node.layer;
    bg.addComponent(UITransform).setContentSize(600, 160);
    const g = bg.addComponent(Graphics);
    g.fillColor = hex('#FFFDF8');
    g.roundRect(-300, -80, 600, 160, 20);
    g.fill();
    g.strokeColor = hex('#8B6914');
    g.lineWidth = 3;
    g.roundRect(-300, -80, 600, 160, 20);
    g.stroke();
    g.fillColor = hex('#FFFDF8');
    g.moveTo(-18, -80);
    g.lineTo(0, -104);
    g.lineTo(18, -80);
    g.close();
    g.fill();
    this.bubble.addChild(bg);

    const chipNode = new Node('RegionChip');
    chipNode.layer = this.node.layer;
    chipNode.addComponent(UITransform).setContentSize(36, 36);
    chipNode.setPosition(-248, 10, 0);
    this.chipGfx = chipNode.addComponent(Graphics);
    this.bubble.addChild(chipNode);

    const textNode = new Node('Body');
    textNode.layer = this.node.layer;
    textNode.addComponent(UITransform).setContentSize(480, 130);
    textNode.setPosition(28, 4, 0);
    this.bodyLabel = textNode.addComponent(Label);
    this.bodyLabel.fontSize = 24;
    this.bodyLabel.lineHeight = 34;
    this.bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.bodyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.bodyLabel.color = hex('#3A2F22');
    this.bubble.addChild(textNode);

    this.root.active = false;
  }

  /** Keep dim cutout aligned with the live board frame. */
  setBoardFrame(frame: { x: number; y: number; size: number }): void {
    this.boardFrame = frame;
    if (this.root?.active) this.redrawDim();
  }

  show(step: CoachStep): void {
    if (!this.root || !this.bodyLabel || !this.chipGfx || !this.bubble) return;
    const color =
      step.regionId != null
        ? REGION_COLORS[step.regionId % REGION_COLORS.length]!
        : BOARD_THEME.accent;

    this.chipGfx.clear();
    this.chipGfx.fillColor = hex(color);
    this.chipGfx.roundRect(-18, -18, 36, 36, 5);
    this.chipGfx.fill();
    this.chipGfx.strokeColor = hex('#5A4630');
    this.chipGfx.lineWidth = 2;
    this.chipGfx.roundRect(-18, -18, 36, 36, 5);
    this.chipGfx.stroke();

    this.bodyLabel.string = i18n.t(step.messageKey).replace(/\{region\}/g, '');

    // Sit the bubble just above the board
    const top = this.boardFrame.y + this.boardFrame.size / 2;
    this.bubble.setPosition(0, top + 110, 0);

    this.redrawDim();
    this.root.active = true;
  }

  hide(): void {
    if (this.root) this.root.active = false;
  }

  isVisible(): boolean {
    return !!this.root?.active;
  }

  /** Dim HUD / action chrome; leave a clear window over the board. */
  private redrawDim(): void {
    if (!this.dimGfx) return;
    const visible = view.getVisibleSize();
    const g = this.dimGfx;
    g.clear();
    g.fillColor = new Color(0, 0, 0, 140);

    const halfW = visible.width / 2;
    const halfH = visible.height / 2;
    const { x, y, size } = this.boardFrame;
    const left = x - size / 2;
    const right = x + size / 2;
    const bottom = y - size / 2;
    const top = y + size / 2;

    // Top band (above board)
    g.rect(-halfW, top, visible.width, halfH - top);
    g.fill();
    // Bottom band (below board)
    g.rect(-halfW, -halfH, visible.width, bottom + halfH);
    g.fill();
    // Left / right gutters beside board
    if (left > -halfW) {
      g.rect(-halfW, bottom, left + halfW, size);
      g.fill();
    }
    if (right < halfW) {
      g.rect(right, bottom, halfW - right, size);
      g.fill();
    }
  }
}
