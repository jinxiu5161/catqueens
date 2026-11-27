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
import { REGION_COLORS } from '../board/BoardTheme';

const { ccclass } = _decorator;

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

/**
 * Reference-style coach chrome: screen dim (HUD/actions), speech bubble with
 * one or more region color chips. Board spotlight / hand live on BoardView.
 */
@ccclass('TechniqueGuidePanel')
export class TechniqueGuidePanel extends Component {
  private root: Node | null = null;
  private dimGfx: Graphics | null = null;
  private bubble: Node | null = null;
  private chipHost: Node | null = null;
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

    this.chipHost = new Node('ChipHost');
    this.chipHost.layer = this.node.layer;
    this.chipHost.addComponent(UITransform).setContentSize(120, 40);
    this.chipHost.setPosition(-230, 10, 0);
    this.bubble.addChild(this.chipHost);

    const textNode = new Node('Body');
    textNode.layer = this.node.layer;
    textNode.addComponent(UITransform).setContentSize(460, 130);
    textNode.setPosition(40, 4, 0);
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

  setBoardFrame(frame: { x: number; y: number; size: number }): void {
    this.boardFrame = frame;
    if (this.root?.active) this.redrawDim();
  }

  show(step: CoachStep): void {
    if (!this.root || !this.bodyLabel || !this.chipHost || !this.bubble) return;

    const ids =
      step.regionIds && step.regionIds.length > 0
        ? step.regionIds
        : step.regionId != null
          ? [step.regionId]
          : [];

    this.chipHost.removeAllChildren();
    const chipW = 32;
    const gap = 8;
    const totalW = ids.length > 0 ? ids.length * chipW + (ids.length - 1) * gap : 0;
    ids.forEach((rid, i) => {
      const color = REGION_COLORS[rid % REGION_COLORS.length]!;
      const chip = new Node(`Chip${i}`);
      chip.layer = this.chipHost!.layer;
      chip.addComponent(UITransform).setContentSize(chipW, chipW);
      chip.setPosition(-totalW / 2 + chipW / 2 + i * (chipW + gap), 0, 0);
      const cg = chip.addComponent(Graphics);
      cg.fillColor = hex(color);
      cg.roundRect(-chipW / 2, -chipW / 2, chipW, chipW, 5);
      cg.fill();
      cg.strokeColor = hex('#5A4630');
      cg.lineWidth = 2;
      cg.roundRect(-chipW / 2, -chipW / 2, chipW, chipW, 5);
      cg.stroke();
      this.chipHost!.addChild(chip);
    });

    // Shift body text when multiple chips need width on the left.
    const textNode = this.bodyLabel.node;
    if (ids.length >= 2) {
      textNode.setPosition(50, 4, 0);
      this.chipHost.setPosition(-220, 10, 0);
    } else {
      textNode.setPosition(40, 4, 0);
      this.chipHost.setPosition(-230, 10, 0);
    }

    const raw = step.messageText ?? i18n.t(step.messageKey);
    this.bodyLabel.string = raw.replace(/\{region\}/g, '');

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

    g.rect(-halfW, top, visible.width, halfH - top);
    g.fill();
    g.rect(-halfW, -halfH, visible.width, bottom + halfH);
    g.fill();
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
