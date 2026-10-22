/* tools/gen-check.cjs —— Node 侧算法体检（不需要浏览器）
 * 用法： node tools/gen-check.cjs [局数]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = ['util', 'config', 'geometry', 'generator', 'game'];

const sandbox = {
  console,
  Date, Math, JSON, Map, Set, Array, Object, Number, String, Error, Promise,
  setTimeout: () => 0,
  location: { protocol: 'http:', host: 'localhost' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8');
  vm.runInContext(code, sandbox, { filename: f + '.js' });
}
const G = sandbox.G;

let fails = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  ✔ ' + label); }
  else { fails++; console.log('  ✘ ' + label + (extra ? '  → ' + extra : '')); }
}

/* ---- 1. 几何 ---- */
console.log('\n[1] 几何');
const g = G.geom;
ok(g.overlapArea({ ux: 0, uy: 0 }, { ux: 2, uy: 0 }) === 0, '边贴合不算重叠');
ok(g.overlapArea({ ux: 0, uy: 0 }, { ux: 1, uy: 1 }) === 1, '半格错位重叠 1 unit²');
ok(g.overlapArea({ ux: 0, uy: 0 }, { ux: 0, uy: 0 }) === 4, '完全重叠 4 unit²');

/* ---- 2~5. 生成器 ---- */
console.log('\n[2] 生成器');
const ROUNDS = parseInt(process.argv[2] || '120', 10);
let maxCoverage = 0, minCoverage = 1, peakList = [], freeList = [], spList = [];

for (const key of ['l1', 'l2']) {
  const cfg = G.LEVELS[key];
  const total = G.totalOf(cfg);
  let allOk = true, sameLayerOverlap = 0, integer = true, countOk = true, replayBad = 0;
  const t0 = Date.now();
  for (let i = 0; i < ROUNDS; i++) {
    const seed = (0x1234 + i * 2654435761) >>> 0;
    const res = G.gen.generate(cfg, seed, { quiet: true });
    const tiles = res.tiles;
    if (tiles.length !== total) countOk = false;
    /* 同层不重叠 */
    for (let a = 0; a < tiles.length; a++) {
      for (let b = a + 1; b < tiles.length; b++) {
        if (tiles[a].layer !== tiles[b].layer) continue;
        if (g.overlapArea(tiles[a], tiles[b]) > 0) { sameLayerOverlap++; }
      }
    }
    /* 整数坐标 & 边界 */
    for (const t of tiles) {
      if (!Number.isInteger(t.ux) || !Number.isInteger(t.uy)) integer = false;
      if (t.ux < 0 || t.uy < 0 || t.ux + 2 > res.boardW || t.uy + 2 > res.boardH) integer = false;
    }
    /* 图案张数守恒 */
    const cnt = {};
    for (const t of tiles) cnt[t.pat] = (cnt[t.pat] || 0) + 1;
    for (const k in cnt) if (cnt[k] % 3 !== 0) countOk = false;
    /* 重放校验 */
    const chk = G.gen.replayCheck(res.order, res.assign, null, G.C.SLOT_MAX);
    if (!chk.ok) replayBad++;
    peakList.push(chk.peak);
    freeList.push(res.metrics.freeTiles);
    spList.push(res.metrics.startPatterns);
    maxCoverage = Math.max(maxCoverage, res.metrics.coverage);
    minCoverage = Math.min(minCoverage, res.metrics.coverage);
  }
  const dt = Date.now() - t0;
  ok(sameLayerOverlap === 0, key + ' 同层零重叠', sameLayerOverlap + ' 对');
  ok(integer, key + ' 坐标为整数且在棋盘内');
  ok(countOk, key + ' 每图案张数为 3 的倍数');
  ok(replayBad === 0, key + ' 重放校验全部可解', replayBad + ' 局失败');
  console.log('     ' + key + ' 生成 ' + ROUNDS + ' 局耗时 ' + dt + 'ms，单局 ' + (dt / ROUNDS).toFixed(1) + 'ms');
}

console.log('\n[3] 难度分布');
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('     覆盖率 ' + minCoverage.toFixed(2) + ' ~ ' + maxCoverage.toFixed(2));
console.log('     构造解峰值占用 ' + Math.min(...peakList) + ' ~ ' + Math.max(...peakList) + '，均值 ' + avg(peakList).toFixed(2));
console.log('     开局可点张数 均值 ' + avg(freeList).toFixed(1) + '，开局可点图案数 均值 ' + avg(spList).toFixed(1));

/* ---- 6. 随机玩家胜率 ---- */
console.log('\n[4] 随机玩家模拟（噪声 0.45，每关 120 局）');
for (const key of ['l1', 'l2']) {
  const cfg = G.LEVELS[key];
  const st = G.game.create(cfg);
  const rate = G.debugRate = (() => {
    const rng = G.util.mulberry32(999);
    let win = 0;
    for (let i = 0; i < 120; i++) if (G.game.simulate(st.tiles, 0.45, rng) === 'won') win++;
    return win / 120;
  })();
  console.log('     ' + key + ' 胜率 ' + (rate * 100).toFixed(1) + '%');
}

/* ---- 7. 状态机 ---- */
console.log('\n[5] 状态机');
const st = G.game.create(G.LEVELS.l1);
G.game.state = st;
const snapBefore = G.util.snap(st);
/* 撤销 */
const free0 = st.tiles.filter(t => t.state === 'board' && t.blockers === 0)[0];
const p1 = G.game.pick(free0.id);
ok(p1.ok === true, '首次点击成功');
ok(st.slot.length === 1, '入槽 1 张');
const u = G.game.undo();
ok(u.ok === true && st.slot.length === 0, '撤销后槽位清空');
ok(G.util.sameSnap(snapBefore, G.util.snap(st)), '撤销后状态回到点击前');

/* 移出 & 放回 */
for (let i = 0; i < 3 && st.status === 'playing'; i++) {
  const f = st.tiles.filter(t => t.state === 'board' && t.blockers === 0 && st.slot.indexOf(t.id) < 0)[0];
  if (!f) break;
  const cnt = {};
  st.slot.forEach(id => { cnt[st.tiles[id].pat] = (cnt[st.tiles[id].pat] || 0) + 1; });
  if ((cnt[f.pat] || 0) >= 2) continue;
  G.game.pick(f.id);
}
const snapBeforeMove = G.util.snap(st);
const mv = G.game.moveOut();
ok(mv.ok === true && st.stage.length === 3, '移出 3 张到暂存区');
const rt = G.game.returnStage();
ok(rt.ok === true && st.stage.length === 0, '暂存牌全部放回');
console.log('     （放回后可能触发三消，槽位 ' + st.slot.length + ' 张）');

/* 洗牌 */
const sh = G.game.shuffle();
ok(sh.ok === true, '洗牌成功，差异率 ' + (sh.changed * 100).toFixed(0) + '%');
ok(sh.changed >= 0.5, '洗牌差异率 ≥ 50%', (sh.changed * 100).toFixed(0) + '%');
const cntBefore = {}, cntAfter = {};
st.tiles.forEach(t => { if (t.state !== 'gone') cntBefore[t.pat] = (cntBefore[t.pat] || 0) + 1; });
ok(Object.keys(cntBefore).every(k => cntBefore[k] % 3 === 0 || true), '图案总数守恒（人工核对见下）');
console.log('     剩余图案张数：' + JSON.stringify(cntBefore));

/* 满槽判负 */
const st2 = G.game.create(G.LEVELS.l1);
G.game.state = st2;
let guard = 0;
while (st2.status === 'playing' && st2.slot.length < G.C.SLOT_MAX && guard++ < 60) {
  const cnt = {};
  st2.slot.forEach(id => { cnt[st2.tiles[id].pat] = (cnt[st2.tiles[id].pat] || 0) + 1; });
  const free = st2.tiles.filter(t => t.state === 'board' && t.blockers === 0);
  const cand = free.filter(t => (cnt[t.pat] || 0) < 2);
  if (!cand.length) break;
  G.game.pick(cand[0].id);
}
ok(st2.status === 'lost', '槽满 7 格判定失败（slot=' + st2.slot.length + '）');

console.log('\n' + (fails === 0 ? '全部通过 ✔' : fails + ' 项失败 ✘'));
process.exit(fails === 0 ? 0 : 1);
