import { _decorator, Color, Component, Label, Node, UITransform } from 'cc';
import type { SessionSnapshot } from '../../app/GameSession';
import { i18n } from '../../core/localization/I18n';
import { BOARD_THEME } from '../board/BoardTheme';

const { ccclass } = _decorator;

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

@ccclass('GameHUD')
export class GameHUD extends Component {
  private levelLabel: Label | null = null;
  private progressLabel: Label | null = null;
  private ticketLabel: Label | null = null;
  private messageLabel: Label | null = null;

  onLoad(): void {
    this.levelLabel = this.makeLabel('LevelLabel', 0, 860, 42, true);
    this.progressLabel = this.makeLabel('ProgressLabel', 0, 800, 28, false);
    this.ticketLabel = this.makeLabel('TicketLabel', 0, 740, 28, false);
    this.messageLabel = this.makeLabel('MessageLabel', 0, -860, 26, false);
  }

  render(snap: SessionSnapshot, message = ''): void {
    if (this.levelLabel) {
      this.levelLabel.string = i18n.t('hud.level', { id: snap.level.id });
    }
    if (this.progressLabel) {
      this.progressLabel.string = i18n.t('hud.progress', {
        n: snap.validation.validCatCount,
        total: snap.level.size,
      });
    }
    if (this.ticketLabel) {
      this.ticketLabel.string = i18n.t('hud.tickets', { n: snap.tickets });
    }
    if (this.messageLabel) {
      this.messageLabel.string = message;
    }
  }

  private makeLabel(name: string, x: number, y: number, fontSize: number, bold: boolean): Label {
    const n = new Node(name);
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(900, 60);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.fontSize = fontSize;
    label.isBold = bold;
    label.color = hex(BOARD_THEME.text);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    this.node.addChild(n);
    return label;
  }
}
