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
  private heartsLabel: Label | null = null;
  private staminaLabel: Label | null = null;
  private messageLabel: Label | null = null;

  onLoad(): void {
    this.levelLabel = this.makeLabel('LevelLabel', 0, 860, 42, true);
    this.progressLabel = this.makeLabel('ProgressLabel', 0, 800, 28, false);
    this.heartsLabel = this.makeLabel('HeartsLabel', 0, 750, 30, false);
    this.staminaLabel = this.makeLabel('StaminaLabel', 0, 710, 26, false);
    this.ticketLabel = this.makeLabel('TicketLabel', 0, 670, 26, false);
    this.messageLabel = this.makeLabel('MessageLabel', 0, -860, 26, false);
    if (this.heartsLabel) this.heartsLabel.color = hex('#E63946');
  }

  render(snap: SessionSnapshot, message = ''): void {
    if (this.levelLabel) {
      const label = snap.level.difficultyLabel;
      const stars = snap.level.difficulty;
      this.levelLabel.string =
        label && stars != null
          ? i18n.t('hud.level_rated', { id: snap.level.id, label, stars })
          : i18n.t('hud.level', { id: snap.level.id });
    }
    if (this.progressLabel) {
      this.progressLabel.string = i18n.t('hud.progress', {
        n: snap.validation.validCatCount,
        total: snap.level.size,
      });
    }
    if (this.heartsLabel) {
      this.heartsLabel.string = this.formatHearts(snap.hearts, snap.heartsMax);
    }
    if (this.staminaLabel) {
      this.staminaLabel.string = i18n.t('hud.stamina', {
        n: snap.stamina,
        max: snap.staminaMax,
      });
    }
    if (this.ticketLabel) {
      this.ticketLabel.string = i18n.t('hud.tickets', { n: snap.tickets });
    }
    if (this.messageLabel) {
      this.messageLabel.string = message;
    }
  }

  /** Filled red hearts for remaining lives; hollow for lost. */
  private formatHearts(hearts: number, max: number): string {
    const filled = '♥'.repeat(Math.max(0, hearts));
    const empty = '♡'.repeat(Math.max(0, max - hearts));
    return i18n.t('hud.hearts', { icons: filled + empty });
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
