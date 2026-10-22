/* endless-check.cjs —— 无限模式各关的生成稳定性 + 牌数是否合法（3 的倍数） */
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

let bad = 0;
console.log('关  牌数  层数  图案  各层列数        峰值  生成  生成耗时');
for (let n = 1; n <= 14; n++) {
  const cfg = G.endlessCfg(n);
  const total = G.totalOf(cfg);
  const cols = cfg.counts.map((c) => G.gen.gridFor(c).cols);
  let okCount = 0, peak = 0;
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) {
    try {
      const st = G.game.create(cfg, (0x77 + i * 7919) >>> 0);
      if (st.tiles.length === total) { okCount++; peak = Math.max(peak, st.peak); }
    } catch (e) { /* fail */ }
  }
  const ms = ((Date.now() - t0) / 6).toFixed(0);
  const legal = total % 3 === 0;
  if (!legal || okCount < 6) bad++;
  console.log(
    String(n).padStart(2) + '  ' + String(total).padStart(4) + (legal ? '  ' : ' ✗') +
    String(cfg.layers).padStart(5) + String(cfg.patterns).padStart(6) +
    '  ' + cols.join(',').padEnd(15) +
    ('max' + peak).padStart(5) +
    '  ' + (okCount + '/6').padStart(5) + '  ' + (ms + 'ms').padStart(6)
  );
}
console.log(bad ? '\n有 ' + bad + ' 关不合法 ✘' : '\n全部关卡合法且可稳定生成 ✔');
