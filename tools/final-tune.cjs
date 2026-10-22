/* final-tune.cjs —— 最终定档：同种子序列、30 局，对比牌数/层数对「强玩家」的影响
 * 结论用于回答「第二关到底放多少张最难」，而不是凭感觉加牌。
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
const SM = G.C.SLOT_MAX;

function encode(tiles) {
  const n = tiles.length;
  return {
    n,
    pat: Int8Array.from(tiles.map((t) => t.pat)),
    blockers: Int8Array.from(tiles.map((t) => t.blockers)),
    state: new Uint8Array(n),
    blocks: tiles.map((t) => Int16Array.from(t.blocks)),
    slot: []
  };
}
const clone = (s) => ({
  n: s.n, pat: s.pat, blockers: s.blockers.slice(),
  state: s.state.slice(), blocks: s.blocks, slot: s.slot.slice()
});

function step(s, id) {
  s.state[id] = 1;
  s.slot.push(id);
  const bs = s.blocks[id];
  for (let i = 0; i < bs.length; i++) s.blockers[bs[i]]--;
  const p = s.pat[id];
  let cnt = 0;
  for (let i = 0; i < s.slot.length; i++) if (s.pat[s.slot[i]] === p) cnt++;
  if (cnt >= 3) {
    const ids = [];
    for (let i = 0; i < s.slot.length && ids.length < 3; i++) if (s.pat[s.slot[i]] === p) ids.push(s.slot[i]);
    s.slot = s.slot.filter((x) => ids.indexOf(x) < 0);
    ids.forEach((x) => { s.state[x] = 2; });
  }
  return s.slot.length;
}

function freeList(s, out) {
  out.length = 0;
  for (let i = 0; i < s.n; i++) if (s.state[i] === 0 && s.blockers[i] === 0) out.push(i);
  return out;
}

function heuristic(s) {
  const cnt = new Map();
  for (const id of s.slot) cnt.set(s.pat[id], (cnt.get(s.pat[id]) || 0) + 1);
  let pairs = 0, singles = 0;
  cnt.forEach((v) => { if (v === 2) pairs++; else if (v === 1) singles++; });
  const free = freeList(s, []);
  let ready = 0;
  for (const id of free) if ((cnt.get(s.pat[id]) || 0) === 2) ready++;
  return -s.slot.length * 10 + pairs * 6 + ready * 5 - singles;
}
const countBoard = (s) => {
  let n = 0;
  for (let i = 0; i < s.n; i++) if (s.state[i] === 0) n++;
  return n;
};

function beamPlay(tiles, K) {
  const root = encode(tiles);
  let beam = [root], best = 0;
  const free = [];
  while (beam.length) {
    const next = [];
    const seen = new Set();
    for (const st of beam) {
      freeList(st, free);
      if (!free.length) {
        if (st.slot.length === 0 && countBoard(st) === 0) return { result: 'won', gone: root.n };
        continue;
      }
      for (const id of free) {
        const ns = clone(st);
        if (step(ns, id) >= SM) continue;
        const gone = root.n - countBoard(ns);
        const key = gone + '|' + ns.slot.map((x) => ns.pat[x]).sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ s: ns, h: heuristic(ns), gone });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => (b.gone - a.gone) || (b.h - a.h));
    beam = next.slice(0, K).map((x) => x.s);
    if (next[0].gone > best) best = next[0].gone;
    for (const st of beam) if (st.slot.length === 0 && countBoard(st) === 0) return { result: 'won', gone: root.n };
  }
  return { result: 'lost', gone: best };
}

const ROUNDS = 30, K = 16;

function run(cfg, label) {
  let win = 0, gsum = 0;
  const t0 = Date.now();
  for (let i = 0; i < ROUNDS; i++) {
    let st;
    try { st = G.game.create(cfg, (0x5f3a + i * 2654435761) >>> 0); }
    catch (e) { continue; }
    const r = beamPlay(st.tiles, K);
    if (r.result === 'won') win++; else gsum += r.gone / st.tiles.length;
  }
  const grid = [];
  for (let k = 0; k < cfg.layers; k++) grid.push(G.gen.gridFor(cfg.counts[k]).cols);
  console.log(
    label.padEnd(20) +
    ('牌' + G.totalOf(cfg)).padStart(7) + ('层' + cfg.layers).padStart(4) +
    '  强玩家 ' + String(win).padStart(2) + '/' + ROUNDS +
    '  平均清到 ' + (win ? '-' : (100 * (1 - gsum / (ROUNDS - win))).toFixed(0) + '%') +
    '  各层列数 ' + grid.join(',') + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'
  );
}

const L2 = G.LEVELS.l2;
const V = (o) => Object.assign({}, L2, o);
console.log('# 槽位 ' + SM + '  beam K=' + K + '  30 局/配置\n');
run(V({ patterns: 11, layers: 6, counts: [35, 30, 24, 16, 12, 9], tight: false }), '旧版 图11 126张');
run(V({ patterns: 12, layers: 6, counts: [35, 30, 24, 16, 12, 9] }), '图12 126张 6层');
run(V({ patterns: 12, layers: 6, counts: [42, 33, 27, 21, 12, 9] }), '图12 144张 6层');
run(V({ patterns: 12, layers: 6, counts: [42, 36, 30, 20, 16, 12] }), '图12 156张 6层');
run(V({ patterns: 12, layers: 7, counts: [42, 36, 30, 24, 18, 15, 12] }), '图12 177张 7层');
run(V({ patterns: 12, layers: 7, counts: [35, 30, 27, 24, 18, 15, 13] }), '图12 162张 7层');
run(V({ patterns: 12, layers: 8, counts: [36, 33, 27, 24, 18, 15, 12, 9] }), '图12 174张 8层');
