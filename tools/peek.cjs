/* peek.cjs —— 看第 2 关构造解的槽位峰值分布，确认 tight 是否真的把占用顶到 6 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.dirname(__dirname);
const sb = {
  console: { log: console.log, warn: () => 0, error: console.error },
  Date, Math, JSON, Map, Set, Array, Object, Number, String, Error, Promise,
  setTimeout: () => 0, location: { protocol: 'http:', host: 'x' }
};
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
['util', 'config', 'geometry', 'generator', 'game'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sb, { filename: f }));
const G = sb.G;

function dist(cfg, label) {
  const hist = {};
  let n = 60;
  for (let i = 0; i < n; i++) {
    let st;
    try { st = G.game.create(cfg, (0xabc + i * 104729) >>> 0); } catch (e) { continue; }
    hist[st.peak] = (hist[st.peak] || 0) + 1;
  }
  const keys = Object.keys(hist).sort();
  console.log(label.padEnd(16) + '峰值分布 ' + keys.map((k) => k + ':' + hist[k]).join('  '));
}

console.log('# 槽位 7，60 局\n');
dist(Object.assign({}, G.LEVELS.l2, { tight: false }), 'L2 tight=false');
dist(G.LEVELS.l2, 'L2 tight=true');
dist(G.endlessCfg(1), '无限第 1 关');
dist(G.endlessCfg(8), '无限第 8 关');
