# 猫咪皇后 · Cat Queens

Cocos Creator **3.8.x** + TypeScript 单机逻辑解谜（iOS / Android）。

规则：每行一只猫、每列一只猫、每个连通色区一只猫；任意两猫不可八方向相邻。

## 打开工程

详见 [`docs/COCOS_SETUP.md`](docs/COCOS_SETUP.md)。

1. 用 **Cocos Creator 3.8.5** 打开本仓库根目录  
2. 按文档创建 `Boot` / `MainMenu` / `Game` / `CatBook` / `Settings` 五个场景并挂载对应脚本  
3. 启动场景设为 `Boot`，预览或构建 App  

> 场景文件需在编辑器中创建一次（脚本已全部就绪，UI 由代码运行时搭建）。

## 目录

```
assets/scripts/
  core/puzzle/     # PuzzleCore（禁止依赖 cc）
  core/level|hint|save|meta|platform|input|localization
  app/             # AppRoot / GameSession / GameController / 菜单
  ui/board|hud|panels
  data/StarterLevels.ts
assets/resources/data/  # levels.json / cats.json / achievements.json
docs/                   # 15.1 分析、Cocos 接线说明
scripts/                # 关卡生成与离线 QA
tests/                  # PuzzleCore 单测（vitest）
```

## 本地脚本（可选，不依赖 Creator）

```bash
npm run generate:levels          # 生成关卡
LEVEL_COUNT=100 npm run generate:levels
npm run qa:levels -- --unique    # 结构 + 唯一解 QA
npx vitest run                   # 核心规则单测
```

## 已实现范围

- PuzzleCore：结构校验、冲突、通关、求解器  
- GameSession：撤销/重做、软引导/严判、存档、提示券  
- HintService：仅确定性提示（唯一解下的必放格）  
- BoardView + 手势：单击×、双击放猫、滑动标×、长按高亮  
- 平台层：`MockPlatformAdapter`（广告/IAP 可替换）  
- 首发包：**50** 关唯一解样例（可再生成扩展）  

**不做**：每日任务、体力、金币、自建服务端。

## 规格文档

- `规则书.docx` — 技术开发规格书 v1.0  
- `策划方案.docx` — 策划方案 v2.3  
- `docs/15.1_实施计划_技术分析.md`
