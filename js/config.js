/* config.js —— 常量 / 关卡配置 / 图标表 / 文案 */
(function (G) {
  'use strict';

  G.C = {
    SLOT_MAX: 7,      // 槽位格数
    STAGE_MAX: 3,     // 暂存格数
    TILE_PX: 56,      // 设计稿牌宽（px）
    UNIT: 2,          // 一张牌占 2x2 逻辑单位
    SAFE_CAP: 6       // 构造解允许占用的最大槽位（留 1 格容错）
  };

  /* 12 个图案，顺序即图案索引；贴图在 assets/pat/<name>.png */
  G.ICONS = [
    'carrot', 'cabbage', 'corn', 'apple', 'mushroom', 'strawberry',
    'sheep', 'eggplant', 'banana', 'peach', 'lemon', 'grape'
  ];
  G.ICON_NAME = {
    carrot: '胡萝卜', cabbage: '白菜', corn: '玉米', apple: '苹果',
    mushroom: '蘑菇', strawberry: '草莓', sheep: '小羊', eggplant: '茄子',
    banana: '香蕉', peach: '桃子', lemon: '柠檬', grape: '葡萄'
  };
  G.PAT_SRC = function (name) { return 'assets/pat/' + name + '.png'; };

  G.LEVELS = {
    l1: {
      id: 'l1', name: '第 1 关', desc: '36 张 · 轻松热身',
      layers: 2, counts: [24, 12], patterns: 5, block: 1,
      props: { undo: 3, move: 3, shuffle: 3 },
      seed: 0x5f2a91
    },
    l2: {
      id: 'l2', name: '第 2 关', desc: '177 张 · 7 层 · 12 种图案 · 地狱难度',
      /* 难度旋钮按有效性排序：
         1) randomSeed（main.js 每局现取）—— 盘面不可背，最有效；
         2) patterns（图案种类）—— 12 是图标上限，全用上；
         3) tight（块内强制轮转）—— 槽位占用顶到 6，同图案间隔拉到最远；
         4) 牌数/层数 —— 只加时长，对算得清的玩家几乎无效（实测过）。
         注意牌数必须是 3 的倍数，否则图案分配不满会直接判负。 */
      layers: 7, counts: [42, 36, 30, 24, 18, 15, 12], patterns: 12, block: 3, tight: true,
      props: { undo: 1, move: 1, shuffle: 0 },
      seed: 0x9c31d7
    }
  };

  /* 把 total 张牌按「下层多、上层少」分给 layers 层 */
  function splitCounts(layers, total) {
    var w = [], k, sum = 0;
    for (k = 0; k < layers; k++) {
      var t = layers === 1 ? 0 : k / (layers - 1);
      w.push(1.15 - 0.55 * t);
      sum += w[k];
    }
    var counts = w.map(function (x) { return Math.max(3, Math.round(total * x / sum)); });
    var diff = total - counts.reduce(function (a, b) { return a + b; }, 0);
    var i = 0;
    while (diff !== 0 && i < 4000) {
      var idx = i % layers;
      if (diff > 0) { counts[idx] += 1; diff -= 1; }
      else if (counts[idx] > 3) { counts[idx] -= 1; diff += 1; }
      i++;
    }
    /* 余数无法靠单层调整时，并入底层 */
    var rest = total - counts.reduce(function (a, b) { return a + b; }, 0);
    if (rest !== 0) counts[0] += rest;
    return counts;
  }

  /* 无限模式第 n 局的配置（n 从 1 开始）
   * 起点就按「地狱」起步（6 层 / 126 张 / 9 图案），之后每关加压：
   * 每关 +9 张、每两关 +1 层、每两关 +1 图案，封顶 9 层 / 210 张 / 12 图案。 */
  G.endlessCfg = function (n) {
    var layers = Math.min(5 + Math.ceil(n / 2), 9);
    var total = Math.min(126 + 9 * (n - 1), 210);
    total = total - (total % 3);
    var patterns = Math.min(9 + Math.floor((n - 1) / 2), 12);
    var counts = splitCounts(layers, total);
    return {
      id: 'endless', name: '无限第 ' + n + ' 关',
      desc: total + ' 张 · ' + layers + ' 层 · ' + patterns + ' 图案',
      layers: layers, counts: counts, patterns: patterns,
      block: 3, tight: true,
      props: { undo: 1, move: 1, shuffle: 0 },
      seed: (G.util.hashStr('endless-' + n) ^ 0x7f4a7c15) >>> 0,
      total: total
    };
  };

  G.totalOf = function (cfg) {
    return cfg.counts.reduce(function (a, b) { return a + b; }, 0);
  };
})(window.G = window.G || {});
