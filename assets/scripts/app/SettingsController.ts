import { _decorator, Button, Component, Label, Node, UITransform, Color } from 'cc';
import { CocosStorageAdapter } from '../core/save/CocosStorageAdapter';
import { saveService } from '../core/save/SaveService';
import { SceneRouter } from './SceneRouter';

const { ccclass } = _decorator;

@ccclass('SettingsController')
export class SettingsController extends Component {
  private softLabel: Label | null = null;

  onLoad(): void {
    saveService.setStorage(new CocosStorageAdapter());
    const title = this.mkLabel('设置', 0, 300, 48);
    title.color = Color.WHITE;

    this.softLabel = this.mkLabel('', 0, 80, 28);
    this.refresh();

    this.mkButton('切换软引导 / 严判', 0, -40, () => {
      const save = saveService.load();
      save.settings.softMode = !save.settings.softMode;
      saveService.save(save);
      this.refresh();
    });

    this.mkButton('返回菜单', 0, -180, () => SceneRouter.load('MainMenu'));
  }

  private refresh(): void {
    const save = saveService.load();
    if (this.softLabel) {
      this.softLabel.string = save.settings.softMode
        ? '当前：软引导（错放不扣红心）'
        : '当前：严判（默认，错放扣红心）';
    }
  }

  private mkLabel(text: string, x: number, y: number, size: number): Label {
    const n = new Node('Label');
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(800, 60);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.color = Color.WHITE;
    this.node.addChild(n);
    return label;
  }

  private mkButton(text: string, x: number, y: number, cb: () => void): void {
    const n = new Node('Btn');
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(520, 80);
    n.setPosition(x, y, 0);
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, cb, this);
    const l = new Node('L');
    l.layer = n.layer;
    l.addComponent(UITransform).setContentSize(520, 80);
    const label = l.addComponent(Label);
    label.string = text;
    label.fontSize = 28;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = Color.YELLOW;
    n.addChild(l);
    this.node.addChild(n);
  }
}
