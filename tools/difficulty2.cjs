/* difficulty2.cjs —— 极限难度扫描：不仅测胜率，还测「生成器能否稳定产出可解局」
 *
 * 用法：node tools/difficulty2.cjs
 *
 * 说明：simulate 是「贪心 + 噪声」的弱玩家模型，绝对值只作相对参考；
 * 关键看三列胜率同时塌到 0 附近、以及 genOK 是否 100%。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.dirname(__dirname);
const warns = [];
const sb = {
  console: { log: console.log, warn: (m) => warns.push(String(m)), error: console.error },
  Date, Math, JSON, Map, Set, Array, Object, Number, String, Error, Promise,
  setTimeout: () => 0,
  location: { protocol: 'http:', host: 'x' }
};
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
['util', 'config', 'geometry', 'generator', 'game'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sb, { filename: f }));
const G = sb.G;

const NOISES = [0.05, 0.15, 0.35];
const ROUNDS = 100;

function measure(cfg, label) {
  /* 1) 生成成功率：8 个不同 seed，看几个能生成出可解局 */
  let genOK = 0;
  const GEN_TRIES = 8;
  for (let i = 0; i < GEN_TRIES; i++) {
    warns.length = 0;
    try {
      const st = G.game.create(cfg, (0x51ed + i * 0x9e3779) >>> 0);
      if (st.tiles.length === G.totalOf(cfg)) genOK++;
    } catch (e) { /* 生成失败 */ }
  }

  /* 2) 胜率：用第一局成功的盘面跑 */
  let st = null;
  try { st = G.game.create(cfg, cfg.seed); } catch (e) { }
  const cells = [];
  if (st) {
    for (const noise of NOISES) {
      const rng = G.util.mulberry32(0xbeef ^ Math.round(noise * 1000));
      let win = 0;
      for (let i = 0; i < ROUNDS; i++) {
        if (G.game.simulate(st.tiles, noise, rng) === 'won') win++;
      }
      cells.push((win / ROUNDS * 100).toFixed(1) + '%');
    }
  } else {
    cells.push('--', '--', '--');
  }

  const total = G.totalOf(cfg);
  console.log(
    label.padEnd(24) +
    ('牌' + total).padStart(6) +
    ('层' + cfg.layers).padStart(5) +
    ('图' + cfg.patterns).padStart(5) +
    ('块' + cfg.block).padStart(5) +
    '  gen ' + (genOK + '/' + GEN_TRIES).padStart(5) +
    '  胜率 ' + cells.map((c, i) => 'n' + NOISES[i] + '=' + c).join(' ') +
    '  初始可点 ' + (st ? st.metrics.freeTiles : '-') +
    ' 峰值 ' + (st ? st.peak : '-')
  );
}

const base = G.LEVELS.l2;
const V = (o) => Object.assign({}, base, o);

console.log('=== 基准：当前线上 ===');
measure(base, 'L2 现状');

console.log('\n=== 1) 图案数抬到上限 12 ===');
[10, 11, 12].forEach((p) => measure(V({ patterns: p }), '图' + p));

console.log('\n=== 2) 块大小（越大越难；>3 可能顶破 7 格槽位）===');
[3, 4].forEach((b) => measure(V({ patterns: 12, block: b }), '图12 块' + b));

console.log('\n=== 3) 加牌数（6 层塞更多）===');
[
  [42, 36, 30, 20, 16, 12],
  [46, 40, 32, 22, 16, 14],
  [48, 44, 36, 26, 18, 14],
].forEach((ct) => measure(V({ patterns: 12, counts: ct }), '图12 ' + ct.reduce((a, b) => a + b, 0) + '张'));

console.log('\n=== 4) 更多层 ===');
[
  [7, [38, 34, 28, 22, 16, 12, 10]],
  [8, [36, 32, 28, 24, 18, 14, 10, 8]],
].forEach(([ly, ct]) => measure(V({ patterns: 12, layers: ly, counts: ct }), '图12 ' + ly + '层' + ct.reduce((a, b) => a + b, 0)));

console.log('\n注：道具未计入模拟，实际游玩比表格更宽容（撤销/移出/洗牌能救 1 次）。');
