/* difficulty.cjs —— 难度体检：给定参数组，用「带噪声的贪心玩家」模拟 N 局，输出胜率。
 *
 * 用法：node tools/difficulty.cjs
 *
 * 玩家模型：每步在「当前可点的牌」里挑一张，噪声越小越接近完美玩家
 *   noise=0.05  ≈ 很细心的玩家（会算槽位余量）
 *   noise=0.15  ≈ 普通玩家（看眼前三消）
 *   noise=0.35  ≈ 随手点
 * 胜率取自「同一批牌局 × 多种子」，所以是分布意义上的，不是单局。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.dirname(__dirname);
const sb = {
  console, Date, Math, JSON, Map, Set, Array, Object, Number, String, Error, Promise,
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
const ROUNDS = 120;

function measure(cfg, label) {
  const st = G.game.create(cfg);
  const cells = [];
  let peak = 0;
  for (const noise of NOISES) {
    const rng = G.util.mulberry32(0xbeef ^ Math.round(noise * 1000));
    let win = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const r = G.game.simulate(st.tiles, noise, rng);
      if (r === 'won') win++;
      if (r.peak && r.peak > peak) peak = r.peak;
    }
    cells.push((win / ROUNDS * 100).toFixed(1) + '%');
  }
  const total = G.totalOf(cfg);
  console.log(
    label.padEnd(26) +
    ('牌' + total).padStart(6) +
    ('层' + cfg.layers).padStart(5) +
    ('图' + cfg.patterns).padStart(5) +
    ('块' + cfg.block).padStart(5) +
    '   胜率 ' + cells.map((c, i) => 'n' + NOISES[i] + '=' + c).join('  ') +
    '   初始可点 ' + st.metrics.freeTiles + ' 种图案 ' + st.metrics.startPatterns
  );
}

console.log('=== 当前线上配置 ===');
measure(G.LEVELS.l2, 'L2 现状');

console.log('\n=== 候选：加图案种类 ===');
[10, 11, 12].forEach((p) => measure(Object.assign({}, G.LEVELS.l2, { patterns: p }), 'L2 图案 ' + p));

console.log('\n=== 候选：加层数（注意：层数太高会让生成器过不了构造校验）===');
[
  [7, [34, 30, 24, 18, 14, 10, 8]]
].forEach(([ly, ct]) => measure(Object.assign({}, G.LEVELS.l2, { layers: ly, counts: ct, patterns: 10 }), 'L2 层' + ly + ' 共' + ct.reduce((a, b) => a + b, 0)));

console.log('\n=== 候选：收道具 ===');
measure(Object.assign({}, G.LEVELS.l2, { patterns: 10, props: { undo: 1, move: 1, shuffle: 0 } }), 'L2 图10 无洗牌');
measure(Object.assign({}, G.LEVELS.l2, { patterns: 11, props: { undo: 1, move: 1, shuffle: 1 } }), 'L2 图11 道具各1');
console.log('\n注：道具影响的是真实玩家体验，上面的模拟不含道具，所以表格是「纯手速上限」。');
