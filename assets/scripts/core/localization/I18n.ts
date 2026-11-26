const ZH_CN: Record<string, string> = {
  'app.title': '猫咪皇后',
  'app.subtitle': 'Cat Queens',
  'hud.level': '第 {id} 关',
  'hud.progress': '进度 {n}/{total}',
  'hud.tickets': '提示券 {n}',
  'btn.undo': '撤销',
  'btn.redo': '重做',
  'btn.hint': '提示',
  'btn.clear': '清空',
  'btn.next': '下一关',
  'btn.retry': '重试',
  'btn.menu': '菜单',
  'btn.apply_hint': '应用提示',
  'win.title': '通关啦',
  'fail.title': '精英关失败',
  'fail.hint': '可免费重试，或切换软引导',
  'hint.forced_cell': '这一格必然是猫',
  'hint.unsolvable': '当前局面无解，建议撤销',
  'hint.no_deterministic': '暂无确定性提示',
  'hint.no_ticket': '提示券不足',
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
