import {
  _decorator,
  Button,
  Color,
  Component,
  Label,
  Node,
  UITransform,
  Graphics,
} from 'cc';
import { i18n } from '../../core/localization/I18n';
import type { TechniqueId } from '../../core/level/LevelTechniques';
import { TECHNIQUE_LABELS } from '../../core/level/LevelTechniques';
import { BOARD_THEME } from '../board/BoardTheme';

const { ccclass } = _decorator;

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

@ccclass('TechniqueGuidePanel')
export class TechniqueGuidePanel extends Component {
  private root: Node | null = null;
  private titleLabel: Label | null = null;
  private bodyLabel: Label | null = null;
  private onDismiss: (() => void) | null = null;

  onLoad(): void {
    this.root = new Node('TechniqueGuideRoot');
    this.root.layer = this.node.layer;
    this.root.addComponent(UITransform).setContentSize(640, 360);
    this.root.setPosition(0, 60, 0);
    this.node.addChild(this.root);

    const bg = new Node('Bg');
    bg.layer = this.node.layer;
    bg.addComponent(UITransform).setContentSize(640, 360);
    const g = bg.addComponent(Graphics);
    g.fillColor = hex('#24352E');
    g.roundRect(-320, -180, 640, 360, 24);
    g.fill();
    g.strokeColor = hex(BOARD_THEME.boardFrame);
    g.lineWidth = 3;
    g.roundRect(-320, -180, 640, 360, 24);
    g.stroke();
    this.root.addChild(bg);

    this.titleLabel = this.mkLabel(this.root, 'Title', 0, 110, 34, true);
    this.bodyLabel = this.mkLabel(this.root, 'Body', 0, 10, 24, false);
    if (this.bodyLabel) {
      const ui = this.bodyLabel.node.getComponent(UITransform)!;
      ui.setContentSize(560, 160);
      this.bodyLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
      this.bodyLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      this.bodyLabel.verticalAlign = Label.VerticalAlign.CENTER;
    }

    this.mkButton(this.root, 'Ok', 0, -120, () => {
      this.hide();
      this.onDismiss?.();
    });

    this.root.active = false;
  }

  /** Show guide for a technique; returns true if shown. */
  show(tech: TechniqueId, onDismiss?: () => void): void {
    if (!this.root) return;
    this.onDismiss = onDismiss ?? null;
    if (this.titleLabel) {
      this.titleLabel.string = i18n.t('technique.guide_title', {
        name: TECHNIQUE_LABELS[tech],
      });
    }
    if (this.bodyLabel) this.bodyLabel.string = i18n.t(`technique.${tech}`);
    this.root.active = true;
  }

  hide(): void {
    if (this.root) this.root.active = false;
  }

  isVisible(): boolean {
    return !!this.root?.active;
  }

  private mkLabel(
    parent: Node,
    name: string,
    x: number,
    y: number,
    size: number,
    bold: boolean,
  ): Label {
    const n = new Node(name);
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(560, 48);
    parent.addChild(n);
    const label = n.addComponent(Label);
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.color = hex(bold ? '#FFE8A3' : '#F5F0E8');
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.string = '';
    return label;
  }

  private mkButton(parent: Node, name: string, x: number, y: number, onClick: () => void): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    n.setPosition(x, y, 0);
    n.addComponent(UITransform).setContentSize(280, 72);
    parent.addChild(n);

    const g = n.addComponent(Graphics);
    g.fillColor = hex(BOARD_THEME.accent);
    g.roundRect(-140, -36, 280, 72, 16);
    g.fill();

    const labelNode = new Node('Label');
    labelNode.layer = n.layer;
    labelNode.addComponent(UITransform).setContentSize(260, 60);
    n.addChild(labelNode);
    const label = labelNode.addComponent(Label);
    label.string = i18n.t('technique.ok');
    label.fontSize = 28;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = hex('#2A2438');

    const btn = n.addComponent(Button);
    btn.node.on(Button.EventType.CLICK, onClick, this);
    return n;
  }
}
