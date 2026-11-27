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
 * Speech-bubble coach above the board (reference-style).
 * Board spotlight / hand pointer live on BoardView; this only shows the tip text.
 */
@ccclass('TechniqueGuidePanel')
export class TechniqueGuidePanel extends Component {
  private root: Node | null = null;
  private chipGfx: Graphics | null = null;
  private bodyLabel: Label | null = null;

  onLoad(): void {
    const visible = view.getVisibleSize();
    this.root = new Node('CoachRoot');
    this.root.layer = this.node.layer;
    this.root.addComponent(UITransform).setContentSize(visible.width, visible.height);
    this.node.addChild(this.root);

    const bubble = new Node('Bubble');
    bubble.layer = this.node.layer;
    bubble.addComponent(UITransform).setContentSize(580, 150);
    bubble.setPosition(0, 420, 0);
    this.root.addChild(bubble);

    const bg = new Node('BubbleBg');
    bg.layer = this.node.layer;
    bg.addComponent(UITransform).setContentSize(580, 150);
    const g = bg.addComponent(Graphics);
    g.fillColor = hex('#FFFDF8');
    g.roundRect(-290, -75, 580, 150, 18);
    g.fill();
    g.strokeColor = hex('#8B6914');
    g.lineWidth = 3;
    g.roundRect(-290, -75, 580, 150, 18);
    g.stroke();
    g.fillColor = hex('#FFFDF8');
    g.moveTo(-18, -75);
    g.lineTo(0, -98);
    g.lineTo(18, -75);
    g.close();
    g.fill();
    bubble.addChild(bg);

    const chipNode = new Node('RegionChip');
    chipNode.layer = this.node.layer;
    chipNode.addComponent(UITransform).setContentSize(36, 36);
    chipNode.setPosition(-240, 8, 0);
    this.chipGfx = chipNode.addComponent(Graphics);
    bubble.addChild(chipNode);

    const textNode = new Node('Body');
    textNode.layer = this.node.layer;
    textNode.addComponent(UITransform).setContentSize(460, 120);
    textNode.setPosition(30, 4, 0);
    this.bodyLabel = textNode.addComponent(Label);
    this.bodyLabel.fontSize = 24;
    this.bodyLabel.lineHeight = 34;
    this.bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.bodyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
    this.bodyLabel.color = hex('#3A2F22');
    bubble.addChild(textNode);

    this.root.active = false;
  }

  show(step: CoachStep): void {
    if (!this.root || !this.bodyLabel || !this.chipGfx) return;
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

    // Strip {region} placeholder — chip stands in for the region color.
    this.bodyLabel.string = i18n.t(step.messageKey).replace(/\{region\}/g, '');
    this.root.active = true;
  }

  hide(): void {
    if (this.root) this.root.active = false;
  }

  isVisible(): boolean {
    return !!this.root?.active;
  }
}
