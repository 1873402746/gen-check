/* strong-player.cjs —— 强玩家模型（beam search），用来给「难度」定标
 *
 * 为什么需要它：difficulty.cjs / difficulty2.cjs 里的玩家是「贪心 + 噪声」，
 * 一旦难度抬高，三档胜率都归零，就无法区分「极难」和「真的没人能过」。
 * 这里用一个带前瞻的集束搜索玩家，近似「非常聪明、且记得住盘面」的人：
 *   每步枚举所有可点牌，按「槽位占用低 + 能凑三消 + 点完露出的同图案多」排序，
 *   保留前 K 个状态继续推进。它能过 → 说明这局对人类还有希望；它过不了 → 基本等于无解。
 *
 * 用法：node tools/strong-player.cjs [beam] [rounds]
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
['util', 'config'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sb, { filename: f }));
/* 槽位必须在 generator/game 加载前定好：两个模块都在加载时快照了 SLOT_MAX */
const SLOT_OVERRIDE = parseInt(process.argv[4] || '', 10);
if (SLOT_OVERRIDE) sb.G.C.SLOT_MAX = SLOT_OVERRIDE;
['geometry', 'generator', 'game'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sb, { filename: f }));
const G = sb.G;

const SLOT_MAX = () => G.C.SLOT_MAX;

/* 一份盘面的紧凑表示，可低成本克隆 */
function encode(tiles) {
  const n = tiles.length;
  const pat = new Int8Array(n);
  const blockers = new Int8Array(n);
  const state = new Uint8Array(n);       // 0=board 1=slot 2=gone
  const blocks = tiles.map((t) => Int16Array.from(t.blocks));
  for (let i = 0; i < n; i++) {
    pat[i] = tiles[i].pat;
    blockers[i] = tiles[i].blockers;
  }
  return { n, pat, blockers, state, blocks, slot: [] };
}

function clone(s) {
  return {
    n: s.n,
    pat: s.pat,
    blockers: s.blockers.slice(),
    state: s.state.slice(),
    blocks: s.blocks,
    slot: s.slot.slice()
  };
}

/* 点一张牌，返回是否凑成消除 / 是否越界 */
function step(s, id) {
  s.state[id] = 1;
  s.slot.push(id);
  const bs = s.blocks[id];
  for (let i = 0; i < bs.length; i++) s.blockers[bs[i]]--;
  const p = s.pat[id];
  let cnt = 0;
  for (let i = 0; i < s.slot.length; i++) if (s.pat[s.slot[i]] === p) cnt++;
  let cleared = 0;
  if (cnt >= 3) {
    const kill = [];
    for (let i = 0; i < s.slot.length && kill.length < 3; i++) {
      if (s.pat[s.slot[i]] === p) kill.push(i);
    }
    /* 从后往前删，避免下移影响 */
    const ids = kill.map((i) => s.slot[i]);
    s.slot = s.slot.filter((x) => ids.indexOf(x) < 0);
    ids.forEach((x) => { s.state[x] = 2; });
    cleared = 3;
  }
  return { left: s.slot.length, cleared };
}

function freeList(s, out) {
  out.length = 0;
  for (let i = 0; i < s.n; i++) if (s.state[i] === 0 && s.blockers[i] === 0) out.push(i);
  return out;
}

const SM = SLOT_MAX();

function heuristic(s) {
  /* 槽位里「双张」的组数：越多越接近三消，越安全 */
  const cnt = new Map();
  for (const id of s.slot) cnt.set(s.pat[id], (cnt.get(s.pat[id]) || 0) + 1);
  let pairs = 0, singles = 0;
  cnt.forEach((v) => { if (v === 2) pairs++; else if (v === 1) singles++; });
  /* 可点牌里有多少张能直接补齐槽内的双张 */
  const free = freeList(s, []);
  let ready = 0;
  for (const id of free) if ((cnt.get(s.pat[id]) || 0) === 2) ready++;
  return -s.slot.length * 10 + pairs * 6 + ready * 5 - singles * 1;
}

/* beam search：返回 'won' / 'lost'，以及走到第几张 */
function beamPlay(tiles, K) {
  const root = encode(tiles);
  let beam = [root];
  let picked = 0, bestPicked = 0;
  const free = [];

  while (beam.length && picked < root.n) {
    const next = [];
    const seen = new Set();
    for (const st of beam) {
      freeList(st, free);
      if (!free.length) {
        /* 没有可点的牌：要么全清，要么卡死 */
        if (st.slot.length === 0) return { result: 'won', picked };
        continue;
      }
      /* 候选牌过多时只取该状态下最有希望的一批，控制分支 */
      const cands = free.slice();
      for (const id of cands) {
        const ns = clone(st);
        const r = step(ns, id);
        if (r.left >= SM) continue;              /* 槽位满且没消掉 → 死 */
        const gone = ns.n - countBoard(ns);
        const key = gone + ':' + ns.slot.map((x) => ns.pat[x]).sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ s: ns, h: heuristic(ns), gone });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => (b.gone - a.gone) || (b.h - a.h));
    beam = next.slice(0, K).map((x) => x.s);
    picked = next[0].gone;
    if (picked > bestPicked) bestPicked = picked;
    /* 全清判定 */
    for (const st of beam) {
      if (st.slot.length === 0 && countBoard(st) === 0) return { result: 'won', picked: root.n };
    }
  }
  return { result: 'lost', picked: bestPicked };
}

function countBoard(s) {
  let n = 0;
  for (let i = 0; i < s.n; i++) if (s.state[i] === 0) n++;
  return n;
}

const K = parseInt(process.argv[2] || '24', 10);
const ROUNDS = parseInt(process.argv[3] || '6', 10);

function run(cfg, label) {
  const results = [];
  for (let i = 0; i < ROUNDS; i++) {
    let st;
    try { st = G.game.create(cfg, (0x1234ab + i * 7919) >>> 0); } catch (e) { results.push('genfail'); continue; }
    const t0 = Date.now();
    const r = beamPlay(st.tiles, K);
    results.push(r.result + '(' + r.picked + '/' + st.tiles.length + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  }
  const won = results.filter((r) => r.startsWith('won')).length;
  console.log(label.padEnd(22) + '强玩家 ' + won + '/' + ROUNDS + ' 过   ' + results.join('  '));
}

console.log('# beam K=' + K + '  槽位 ' + SM + '  强玩家模型（能过 = 人类尚有希望）\n');

const base = G.LEVELS.l2;
const V = (o) => Object.assign({}, base, o);

run(base, '现状 图11 126张');
run(V({ patterns: 12, layers: 6, counts: [42, 36, 30, 20, 16, 12] }), '图12 156张 6层');
run(V({ patterns: 12, layers: 7, counts: [42, 36, 30, 24, 18, 15, 12] }), '图12 177张 7层');
run(V({ patterns: 12, layers: 7, counts: [42, 36, 30, 24, 18, 15, 12], tight: 1 }), '图12 177张 紧块');
/* 金字塔：底层厚、顶层极薄 → 可点牌少，每步选择少但必须选对 */
run(V({ patterns: 12, layers: 6, counts: [60, 45, 30, 18, 12, 9], tight: 1 }), '金字塔 174张');
run(V({ patterns: 12, layers: 7, counts: [54, 45, 36, 27, 18, 12, 9], tight: 1 }), '金字塔 201张');
