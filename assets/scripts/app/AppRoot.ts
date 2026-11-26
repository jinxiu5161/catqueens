import { _decorator, Component, director, game, Game } from 'cc';
import { CocosStorageAdapter } from '../core/save/CocosStorageAdapter';
import { saveService } from '../core/save/SaveService';
import { platformService } from '../core/platform/PlatformService';
import { SceneRouter } from './SceneRouter';

const { ccclass } = _decorator;

/**
 * Attach to Boot scene root.
 * Initializes storage + platform mock, then routes to MainMenu / Game.
 */
@ccclass('AppRoot')
export class AppRoot extends Component {
  async start(): Promise<void> {
    saveService.setStorage(new CocosStorageAdapter());
    game.on(Game.EVENT_HIDE, this.onHide, this);
    try {
      await platformService.initialize();
    } catch (e) {
      console.warn('[CatQueens] platform init failed; continuing offline', e);
    }

    const save = saveService.load();
    if (save.progress.clearedLevelIds.length > 0 || save.currentRun) {
      SceneRouter.load('Game');
    } else {
      SceneRouter.load('MainMenu');
    }
  }

  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.onHide, this);
  }

  private onHide(): void {
    // SaveService already persists on each move; flush current if needed
    void director;
  }
}
