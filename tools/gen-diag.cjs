/* gen-diag.cjs —— 诊断生成失败卡在哪个阶段，用于安全地加层/加牌
 *
 * 结论（2026-10-22）：之前的「层数高了就生成失败」是**牌数不是 3 的倍数**导致的，
 * 不是布局或遮挡的问题。170/208/136 都不是 3 的倍数，distribute 会算出 171/210/138 张，
 * 多出来的牌没处放，重放校验直接溢出。牌数保持 3 的倍数后，7 层 8 层都能稳定生成。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.dirname(__dirname);
const sb = {
  console: { log: console.log, warn: () => 0, error: console.error },
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

function diag(cfg, label, tries = 40) {
  const total = G.totalOf(cfg);
  const tally = { tiles: 0, order: 0, assign: 0, overflow: 0, ok: 0, dup: 0, mod: 0 };
  let peakMax = 0;
  if (total % 3 !== 0) tally.mod = 1;
  for (let a = 0; a < tries; a++) {
    const rng = G.util.mulberry32((cfg.seed + a * 7919) >>> 0);
    const tiles = G.gen.buildLayout(cfg, rng);
    if (tiles.length !== total) { tally.tiles++; continue; }
    const seen = new Set();
    let dup = false;
    for (const t of tiles) {
      const k = t.layer + ':' + t.ux + ':' + t.uy;
      if (seen.has(k)) dup = true;
      seen.add(k);
    }
    if (dup) { tally.dup++; continue; }

    G.geom.normalize(tiles);
    G.geom.buildOcclusion(tiles);
    const order = G.gen.witnessOrderOf(tiles, rng);
    if (order.length !== total) { tally.order++; continue; }

    const counts = G.gen.distribute(total / 3, cfg.patterns);
    const need = new Map();
    for (let i = 0; i < counts.length; i++) if (counts[i] > 0) need.set(i, counts[i]);
    const assign = G.gen.assignPlan(order, need, null, rng, cfg.block || 2);
    if (!assign || assign.size !== total) { tally.assign++; continue; }
    const chk = G.gen.replayCheck(order, assign, null, G.C.SLOT_MAX);
    if (!chk.ok) { tally.overflow++; continue; }
    tally.ok++;
    if (chk.peak > peakMax) peakMax = chk.peak;
  }
  console.log(
    label.padEnd(18) +
    ('牌' + total).padStart(7) + (total % 3 ? ' ✗' : '  ') +
    ('层' + cfg.layers).padStart(4) + ('图' + cfg.patterns).padStart(4) +
    '  成功 ' + (tally.ok + '/' + tries).padStart(6) +
    '  拓扑序不足 ' + tally.order +
    ' 回填不足 ' + tally.assign +
    ' 溢出 ' + tally.overflow +
    '  峰值max ' + peakMax
  );
}

const base = Object.assign({}, G.LEVELS.l2, { patterns: 12 });
console.log('=== 6 层 ===');
[
  [42, 36, 30, 20, 16, 12],  // 156
  [46, 40, 32, 22, 17, 14],  // 171
  [48, 44, 36, 26, 18, 17],  // 189
  [52, 48, 40, 30, 22, 17],  // 209
].forEach((ct) => diag(Object.assign({}, base, { counts: ct }), ct.reduce((a, b) => a + b, 0) + '张'));

console.log('\n=== 7 层 ===');
[
  [36, 33, 27, 21, 15, 12, 9],  // 153
  [38, 34, 29, 22, 17, 13, 11], // 164 → 加 1 = 165
  [40, 36, 30, 24, 18, 15, 11], // 174
].forEach((ct) => diag(Object.assign({}, base, { layers: 7, counts: ct }), '7层 ' + ct.reduce((a, b) => a + b, 0) + '张'));

console.log('\n=== 8 层 ===');
[
  [36, 33, 27, 24, 18, 12, 9, 6], // 165
  [38, 35, 30, 24, 20, 15, 12, 9], // 183
].forEach((ct) => diag(Object.assign({}, base, { layers: 8, counts: ct }), '8层 ' + ct.reduce((a, b) => a + b, 0) + '张'));

console.log('\n=== 9 层 ===');
[[30, 28, 24, 20, 16, 13, 11, 9, 8], // 159
[33, 30, 27, 24, 20, 16, 13, 11, 9]  // 183
].forEach((ct) => diag(Object.assign({}, base, { layers: 9, counts: ct }), '9层 ' + ct.reduce((a, b) => a + b, 0) + '张'));
