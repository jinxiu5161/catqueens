# Cocos Creator 打开与场景接线

目标引擎：**Cocos Creator 3.8.5**（`package.json` → `creator.version`；可用 3.8.x 打开后按需升级锁定）。

## 1. 打开工程

1. 安装 [Cocos Creator 3.8.5](https://www.cocos.com/creator-download)
2. 仪表盘 → **打开其他** → 选择本仓库根目录（含 `assets/`、`settings/`、`package.json`）
3. 首次打开会生成 `library/`、`temp/`、`.meta`（已在 `.gitignore`）

## 2. 创建场景（首次必需）

编辑器里新建 5 个 **UI 场景**（Canvas 设计分辨率 1080×1920）：

| 场景名 | 根节点挂载组件 |
|---|---|
| `Boot` | `AppRoot` |
| `MainMenu` | `MainMenuController` |
| `Game` | `GameController` |
| `CatBook` | `CatBookController` |
| `Settings` | `SettingsController` |

建议步骤（以 `Game` 为例）：

1. 菜单 **文件 → 新建场景**
2. 添加 **Canvas**（或使用 2D 空场景后加 Canvas）
3. 在 Canvas 下建空节点 `GameRoot`
4. 将 `assets/scripts/app/GameController.ts` 拖到 `GameRoot`
5. 保存为 `assets/scenes/Game.scene`
6. 其余场景同理

在 **项目设置 → 功能裁剪** 保持默认即可；**项目设置 → 项目数据** 里把启动场景设为 `Boot`。

## 3. 构建 App

- Android / iOS：菜单 **项目 → 构建发布**
- 核心玩法离线可运行；广告/IAP 当前为 `MockPlatformAdapter`

## 4. 关卡数据

- 运行时读取：`assets/scripts/data/StarterLevels.ts`（已打进脚本）
- 同源 JSON：`assets/resources/data/levels.json`
- 重新生成（本机 Node）：

```bash
npm run generate:levels          # 默认 50 关
LEVEL_COUNT=100 npm run generate:levels
npm run qa:levels -- --unique
```

## 5. 模块边界（勿破坏）

- `assets/scripts/core/puzzle/**`：**禁止** `import` from `cc`
- UI 只调用 `GameSession` / `PuzzleValidator`，不要复制规则
- 存档不写 `CONFLICT` / hearts / daily / streak
