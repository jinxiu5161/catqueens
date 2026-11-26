import {
  _decorator,
  Button,
  Color,
  Component,
  Label,
  Node,
  UITransform,
} from 'cc';
import { i18n } from '../../core/localization/I18n';
import { BOARD_THEME } from '../board/BoardTheme';

const { ccclass } = _decorator;

export interface ActionBarHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onHint: () => void;
  onClear: () => void;
  onNext: () => void;
  onApplyHint: () => void;
}

@ccclass('ActionBar')
export class ActionBar extends Component {
  private handlers: ActionBarHandlers | null = null;
  private applyBtn: Node | null = null;

  onLoad(): void {
    const bar = new Node('BarRoot');
    bar.layer = this.node.layer;
    bar.addComponent(UITransform).setContentSize(1000, 120);
    bar.setPosition(0, -720, 0);
    this.node.addChild(bar);

    const specs: Array<{ key: string; label: string; handler: keyof ActionBarHandlers; x: number }> = [
      { key: 'undo', label: 'btn.undo', handler: 'onUndo', x: -400 },
      { key: 'redo', label: 'btn.redo', handler: 'onRedo', x: -240 },
      { key: 'hint', label: 'btn.hint', handler: 'onHint', x: -80 },
      { key: 'clear', label: 'btn.clear', handler: 'onClear', x: 80 },
      { key: 'next', label: 'btn.next', handler: 'onNext', x: 280 },
    ];

    for (const s of specs) {
      this.makeButton(bar, s.key, i18n.t(s.label), s.x, () => this.handlers?.[s.handler]());
    }

    this.applyBtn = this.makeButton(bar, 'apply', i18n.t('btn.apply_hint'), 420, () =>
      this.handlers?.onApplyHint(),
    );
    this.applyBtn.active = false;
  }

  setHandlers(handlers: ActionBarHandlers): void {
    this.handlers = handlers;
  }

  setApplyVisible(visible: boolean): void {
    if (this.applyBtn) this.applyBtn.active = visible;
  }

  private makeButton(parent: Node, name: string, text: string, x: number, cb: () => void): Node {
    const n = new Node(name);
    n.layer = parent.layer;
    n.addComponent(UITransform).setContentSize(140, 72);
    n.setPosition(x, 0, 0);
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    n.on(Button.EventType.CLICK, cb, this);

    const labelNode = new Node('Label');
    labelNode.layer = n.layer;
    labelNode.addComponent(UITransform).setContentSize(140, 72);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 26;
    label.color = (() => {
      const c = new Color();
      c.fromHEX(BOARD_THEME.accent);
      return c;
    })();
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    n.addChild(labelNode);
    parent.addChild(n);
    return n;
  }
}
