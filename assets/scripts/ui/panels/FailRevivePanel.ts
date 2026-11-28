import {
  _decorator,
  Button,
  Color,
  Component,
  Label,
  Node,
  UITransform,
} from 'cc';
import type { SessionSnapshot } from '../../app/GameSession';
import { i18n } from '../../core/localization/I18n';
import { BOARD_THEME } from '../board/BoardTheme';

const { ccclass } = _decorator;

export interface FailReviveHandlers {
  onReviveAd: () => void;
  onGiveUp: () => void;
  onRetry: () => void;
}

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

@ccclass('FailRevivePanel')
export class FailRevivePanel extends Component {
  private handlers: FailReviveHandlers | null = null;
  private root: Node | null = null;
  private titleLabel: Label | null = null;
  private detailLabel: Label | null = null;
  private reviveBtn: Node | null = null;
  private giveUpBtn: Node | null = null;
  private retryBtn: Node | null = null;

  onLoad(): void {
    this.root = new Node('FailRoot');
    this.root.layer = this.node.layer;
    this.root.addComponent(UITransform).setContentSize(720, 420);
    this.root.setPosition(0, 40, 0);
    this.node.addChild(this.root);

    this.titleLabel = this.mkLabel(this.root, 'Title', 0, 140, 36, true);
    this.detailLabel = this.mkLabel(this.root, 'Detail', 0, 70, 26, false);

    this.reviveBtn = this.mkButton(this.root, 'Revive', 0, -20, () =>
      this.handlers?.onReviveAd(),
    );
    this.giveUpBtn = this.mkButton(this.root, 'GiveUp', 0, -120, () =>
      this.handlers?.onGiveUp(),
    );
    this.retryBtn = this.mkButton(this.root, 'Retry', 0, -20, () =>
      this.handlers?.onRetry(),
    );

    this.root.active = false;
  }

  setHandlers(handlers: FailReviveHandlers): void {
    this.handlers = handlers;
  }

  render(snap: SessionSnapshot): void {
    if (!this.root) return;

    if (snap.needsRevive) {
      this.root.active = true;
      const left = Math.max(0, snap.maxRevives - snap.revivesUsed);
      if (this.titleLabel) this.titleLabel.string = i18n.t('revive.title');
      if (this.detailLabel) {
        this.detailLabel.string = i18n.t('revive.detail', { n: left });
      }
      if (this.reviveBtn) {
        this.reviveBtn.active = left > 0;
        this.setBtnText(this.reviveBtn, i18n.t('revive.watch_ad'));
      }
      if (this.giveUpBtn) {
        this.giveUpBtn.active = true;
        this.setBtnText(this.giveUpBtn, i18n.t('revive.give_up'));
      }
      if (this.retryBtn) this.retryBtn.active = false;
      return;
    }

    if (snap.levelFailed || snap.noStamina) {
      this.root.active = true;
      if (this.titleLabel) {
        this.titleLabel.string = snap.noStamina
          ? i18n.t('stamina.empty_title')
          : i18n.t('fail.title');
      }
      if (this.detailLabel) {
        this.detailLabel.string = snap.noStamina
          ? i18n.t('stamina.empty_detail')
          : i18n.t('fail.stamina_cost', {
              n: snap.stamina,
              max: snap.staminaMax,
            });
      }
      if (this.reviveBtn) this.reviveBtn.active = false;
      if (this.giveUpBtn) this.giveUpBtn.active = false;
      if (this.retryBtn) {
        this.retryBtn.active = snap.stamina > 0 && !snap.noStamina;
        this.setBtnText(this.retryBtn, i18n.t('btn.retry'));
      }
      // noStamina: still show retry disabled via hidden; only message
      if (snap.noStamina && this.retryBtn) this.retryBtn.active = false;
      return;
    }

    this.root.active = false;
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
    n.addComponent(UITransform).setContentSize(680, 60);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.fontSize = size;
    label.isBold = bold;
    label.color = hex(BOARD_THEME.text);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    parent.addChild(n);
    return label;
  }

  private mkButton(parent: Node, name: string, x: number, y: number, cb: () => void): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    n.addComponent(UITransform).setContentSize(420, 80);
    n.setPosition(x, y, 0);
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    n.on(Button.EventType.CLICK, cb, this);

    const labelNode = new Node('Label');
    labelNode.layer = n.layer;
    labelNode.addComponent(UITransform).setContentSize(420, 80);
    const label = labelNode.addComponent(Label);
    label.string = name;
    label.fontSize = 28;
    label.color = hex(BOARD_THEME.accent);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    n.addChild(labelNode);
    parent.addChild(n);
    return n;
  }

  private setBtnText(btn: Node, text: string): void {
    const label = btn.getChildByName('Label')?.getComponent(Label);
    if (label) label.string = text;
  }
}
