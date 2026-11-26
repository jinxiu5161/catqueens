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
