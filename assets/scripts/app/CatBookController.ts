import { _decorator, Button, Color, Component, Label, Node, UITransform } from 'cc';
import { catBookService } from '../core/meta/CatBookService';
import { CocosStorageAdapter } from '../core/save/CocosStorageAdapter';
import { saveService } from '../core/save/SaveService';
import { SceneRouter } from './SceneRouter';

const { ccclass } = _decorator;

@ccclass('CatBookController')
export class CatBookController extends Component {
  onLoad(): void {
    saveService.setStorage(new CocosStorageAdapter());
    const save = saveService.load();
    catBookService.syncUnlocks(save);
    saveService.save(save);

    this.mkLabel('猫咪图鉴', 0, 400, 48);
    this.mkLabel(
      `已解锁 ${save.collection.unlockedCatIds.length} / ${catBookService.list().length}`,
      0,
      320,
      28,
    );

    let y = 220;
    for (const cat of catBookService.list().slice(0, 12)) {
      const unlocked = save.collection.unlockedCatIds.includes(cat.id);
      this.mkLabel(`${cat.id} ${unlocked ? '✓' : '锁'}`, 0, y, 24);
      y -= 40;
    }

    this.mkButton('返回', 0, -420, () => SceneRouter.load('MainMenu'));
  }

  private mkLabel(text: string, x: number, y: number, size: number): void {
    const n = new Node('L');
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(800, 40);
    n.setPosition(x, y, 0);
    const label = n.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.color = Color.WHITE;
    this.node.addChild(n);
  }

  private mkButton(text: string, x: number, y: number, cb: () => void): void {
    const n = new Node('B');
    n.layer = this.node.layer;
    n.addComponent(UITransform).setContentSize(280, 72);
    n.setPosition(x, y, 0);
    n.addComponent(Button);
    n.on(Button.EventType.CLICK, cb, this);
    const l = new Node('L');
    l.addComponent(UITransform).setContentSize(280, 72);
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
