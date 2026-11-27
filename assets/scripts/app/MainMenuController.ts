import {
  _decorator,
  Button,
  Color,
  Component,
  Label,
  Node,
  UITransform,
  view,
} from 'cc';
import { i18n } from '../core/localization/I18n';
import { CocosStorageAdapter } from '../core/save/CocosStorageAdapter';
import { saveService } from '../core/save/SaveService';
import { BOARD_THEME } from '../ui/board/BoardTheme';
import { SceneRouter } from './SceneRouter';

const { ccclass } = _decorator;

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

@ccclass('MainMenuController')
export class MainMenuController extends Component {
  onLoad(): void {
    saveService.setStorage(new CocosStorageAdapter());
    const size = view.getVisibleSize();
    const root = this.node;
    (root.getComponent(UITransform) || root.addComponent(UITransform)).setContentSize(
      size.width,
      size.height,
    );

    this.addLabel('Brand', i18n.t('app.title'), 0, 280, 72, true);
    this.addLabel('Sub', i18n.t('app.subtitle'), 0, 200, 28, false);

    const save = saveService.load();
    const playText =
      save.progress.clearedLevelIds.length || save.currentRun
        ? i18n.t('menu.continue')
        : i18n.t('menu.play');

    this.addButton('Play', playText, 0, 40, () => SceneRouter.load('Game'));
    this.addButton('Book', i18n.t('menu.book'), 0, -80, () => SceneRouter.load('CatBook'));
    this.addButton('Settings', i18n.t('menu.settings'), 0, -200, () => SceneRouter.load('Settings'));
  }

  private addLabel(
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    bold: boolean,
  ): void {
    const n = new Node(name);
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(900, 80);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.isBold = bold;
    label.color = hex(BOARD_THEME.text);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.node.addChild(n);
  }

  private addButton(name: string, text: string, x: number, y: number, cb: () => void): void {
    const n = new Node(name);
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(360, 88);
    n.setPosition(x, y, 0);
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, cb, this);
    const labelNode = new Node('Label');
    labelNode.layer = n.layer;
    labelNode.addComponent(UITransform).setContentSize(360, 88);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 34;
    label.color = hex(BOARD_THEME.accent);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    n.addChild(labelNode);
    this.node.addChild(n);
  }
}
