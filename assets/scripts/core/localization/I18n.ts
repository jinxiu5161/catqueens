const ZH_CN: Record<string, string> = {
  'app.title': '猫咪皇后',
  'app.subtitle': 'Cat Queens',
  'hud.level': '第 {id} 关',
  'hud.level_rated': '第 {id} 关 · {label} {stars}★',
  'hud.progress': '进度 {n}/{total}',
  'hud.tickets': '提示券 {n}',
  'hud.hearts': '错误次数 {icons}',
  'hud.stamina': '体力 {n}/{max}',
  'btn.undo': '撤销',
  'btn.redo': '重做',
  'btn.hint': '提示',
  'btn.clear': '清空',
  'btn.next': '下一关',
  'btn.retry': '重试本关',
  'btn.menu': '菜单',
  'btn.apply_hint': '应用提示',
  'win.title': '通关啦',
  'fail.title': '本关失败',
  'fail.hint': '放猫错误，已扣除一次错误次数',
  'fail.stamina_cost': '已消耗 1 点体力，剩余 {n}/{max}',
  'revive.title': '错误次数已用完',
  'revive.detail': '观看广告可复活（本关还可复活 {n} 次）',
  'revive.watch_ad': '观看广告复活',
  'revive.give_up': '放弃（消耗体力）',
  'stamina.empty_title': '体力不足',
  'stamina.empty_detail': '体力已用完，稍后再来挑战吧',
  'heart.lost': '放猫错误，剩余红心 {n}',
  'hint.forced_cell': '这一格必然是猫',
  'hint.unsolvable': '你现在的标记让局面无解了（本关仍有唯一解），请撤销或清空',
  'hint.no_deterministic': '暂无确定性提示',
  'hint.no_ticket': '提示券不足',
  'board.unsolvable': '当前标记导致无解（关卡本身有唯一解），请撤销排除或清空',
  'board.unique_ok': '本关已验证唯一解',
  'board.tip_exclude': '单击或滑动切换排除；再滑回已排除格会取消；滑过猫格不变；双击排除格可放猫',
  // Levels 1–2 onboarding — keep short so 4×4 does not feel repetitive
  'tutorial.1': '每行、每列、每个色区各放一只猫；猫不能相邻（含斜角）。',
  'tutorial.2': '先放唯一的单格猫，再叉掉它的整行整列——下一只猫就会露出来。',
  'coach.L1_place': '这一格是单独色区——双击放上第一只小猫',
  'coach.L1_rowcol': '放好后，点击或滑动叉掉这一行和这一列的其他格子',
  'coach.L3_adj': '这只猫已经放好了——滑动叉掉周围格子后，下一只就会露出来',
  'technique.guide_title': '新技巧：{name}',
  'technique.ok': '明白了',
  'technique.T1':
    '若某个色区的格子全部落在同一行（或同一列），那只猫必在这一行/列里——其余格子可以先叉掉。',
  'technique.T2':
    '若两个色区的全部格子都挤在某两列里，这两列恰好各有一只猫——列里不属于这两区的格子可排除。',
  'technique.T3':
    '放下一只猫后，马上叉掉同行、同列、同色区和周围八格；常会逼出下一只「只剩一格」的强制猫。',
  'technique.T4':
    '把双区鸽巢推广：三个色区挤进三行或三列时，同样可以整行/列排除无关格子。',
  'technique.T5':
    '注意只剩两格的色区：它们常和「某行只剩两个候选」联动，互相卡住后可以排除矛盾一侧。',
  'technique.T6':
    '当没有强制落点时，可对某个二选一格试放一步：若立刻矛盾就叉掉它，再换另一侧。',
  // Interactive board coach (bubble); {region} → color chip beside text
  'coach.T1_row':
    '我们学习过，由于{region}中一定有一只小猫，所以这一行其他格子可以先划掉排除',
  'coach.T1_col':
    '我们学习过，由于{region}中一定有一只小猫，所以这一列其他格子可以先划掉排除',
  'coach.T2_row': '这两个色区挤在两行里，行上不属于它们的格子可以先排除',
  'coach.T2_col': '这两个色区挤在两列里，列上不属于它们的格子可以先排除',
  'coach.T3_place': '这里只剩一格能放——双击放上小猫',
  'coach.T3_cascade': '放好后马上叉掉同行、同列、同色区和周围八格',
  'coach.T4_row': '多个色区挤进同样多的行时，行上无关格子可以整行排除',
  'coach.T4_col': '多个色区挤进同样多的列时，列上无关格子可以整列排除',
  'coach.T5': '两格色区只剩一侧合理——先把矛盾的那一格划掉',
  'coach.T6_place': '没有强制落点时，先试放这一格；若立刻矛盾就换另一侧',
  'coach.T6_exclude': '试推后矛盾的一侧可以先划掉，再看另一侧',
  'conflict.row': '同一行不能有多只猫',
  'conflict.column': '同一列不能有多只猫',
  'conflict.region': '同一色区不能有多只猫',
  'conflict.adjacent': '太近啦',
  'menu.play': '开始游戏',
  'menu.continue': '继续',
  'menu.book': '图鉴',
  'menu.settings': '设置',
};

const TABLES: Record<string, Record<string, string>> = {
  'zh-CN': ZH_CN,
};

export class I18n {
  language = 'zh-CN';

  t(key: string, args?: Record<string, string | number>): string {
    const table = TABLES[this.language] ?? ZH_CN;
    let text = table[key] ?? ZH_CN[key] ?? key;
    if (args) {
      for (const [k, v] of Object.entries(args)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }
}

export const i18n = new I18n();
