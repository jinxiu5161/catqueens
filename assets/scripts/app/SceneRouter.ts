import { director } from 'cc';

export type SceneName = 'Boot' | 'MainMenu' | 'Game' | 'CatBook' | 'Settings';

export class SceneRouter {
  static load(scene: SceneName): void {
    director.loadScene(scene);
  }
}
