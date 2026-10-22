/* generator.js —— 布局生成 / 拓扑清空序 / 图案回填 / 洗牌重建 */
(function (G) {
  'use strict';
  var U = G.C.UNIT;
  var UU = G.util;

  /* 每层的半格偏移，制造错位堆叠 */
  var OFFSETS = [[0, 0], [1, 1], [1, 0], [0, 1], [1, 1], [0, 1], [1, 0], [0, 1], [1, 1]];

  /* ---------- 1. 每层网格 ---------- */
  function gridFor(n) {
    var best = null;
    for (var cols = 2; cols <= 8; cols++) {
      var rows = Math.ceil(n / cols);
      if (rows > cols) continue;
      var waste = cols * rows - n;
      var score = waste * 2.5 + Math.abs(cols - rows) * 0.5;
      if (!best || score < best.score) best = { cols: cols, rows: rows, score: score };
    }
    return best || { cols: n, rows: 1 };
  }

  /* 从网格里取「离中心最近」的 n 个格子 —— 形成致密团块而不是散点 */
  function layerCells(n, rng, grid) {
    var g = grid || gridFor(n), all = [], r, c;
    for (r = 0; r < g.rows; r++) {
      for (c = 0; c < g.cols; c++) all.push({ c: c, r: r });
    }
    var cx = (g.cols - 1) / 2, cy = (g.rows - 1) / 2;
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      a.d = Math.pow(a.c - cx, 2) + Math.pow(a.r - cy, 2) * 1.15 + rng() * 0.35;
    }
    all.sort(function (a, b) { return a.d - b.d; });
    return all.slice(0, n);
  }

  function buildLayout(cfg, rng) {
    var grids = [], maxCols = 0, maxRows = 0, k, n;
    for (k = 0; k < cfg.layers; k++) {
      n = cfg.counts[k] || 0;
      var g = n ? gridFor(n) : { cols: 0, rows: 0 };
      grids.push(g);
      if (g.cols > maxCols) maxCols = g.cols;
      if (g.rows > maxRows) maxRows = g.rows;
    }

    var tiles = [];
    for (k = 0; k < cfg.layers; k++) {
      var cnt = cfg.counts[k] || 0;
      if (!cnt) continue;
      var gg = grids[k];
      var cells = layerCells(cnt, rng, gg);
      var off = OFFSETS[k % OFFSETS.length];
      /* 关键：以最大网格为基准居中，让上层落进下层的怀里 */
      var bx = (maxCols - gg.cols) + off[0];
      var by = (maxRows - gg.rows) + off[1];
      for (var i = 0; i < cells.length; i++) {
        tiles.push({
          id: tiles.length, pat: -1, layer: k,
          ux: bx + cells[i].c * U,
          uy: by + cells[i].r * U,
          state: 'board', blockers: 0, blocks: []
        });
      }
    }
    return tiles;
  }

  /* ---------- 2. 合法清空序（随机拓扑序） ---------- */
  function witnessOrderOf(subset, rng) {
    var blockerCopy = new Map(), byId = new Map(), i, t;
    for (i = 0; i < subset.length; i++) {
      t = subset[i];
      blockerCopy.set(t.id, t.blockers);
      byId.set(t.id, t);
    }
    var avail = [];
    for (i = 0; i < subset.length; i++) if (subset[i].blockers === 0) avail.push(subset[i].id);
    var order = [], guard = 0;
    while (avail.length && guard++ < 100000) {
      var idx = Math.floor(rng() * avail.length);
      var id = avail.splice(idx, 1)[0];
      order.push(id);
      var blocks = byId.get(id).blocks;
      for (var b = 0; b < blocks.length; b++) {
        var bid = blocks[b];
        if (!blockerCopy.has(bid)) continue;
        var v = blockerCopy.get(bid) - 1;
        blockerCopy.set(bid, v);
        if (v === 0) avail.push(bid);
      }
    }
    return order;
  }

  /* ---------- 3. 图案张数分配 ---------- */
  function distribute(groups, patterns) {
    var counts = [], base = Math.floor(groups / patterns), rem = groups % patterns, i;
    for (i = 0; i < patterns; i++) {
      var g = base + (i < rem ? 1 : 0);
      counts.push(g * 3);
    }
    return counts;
  }

  /* ---------- 4. 按「块」回填图案 ----------
   * 每块最多 B 个图案、共 3B 张牌。块内任意排列下，槽位占用上界 = 2B，
   * 因此 B=3 时峰值必然 ≤ 6 < 7，构造解一定走得通。
   */
  function assignPlan(order, need, seedCounts, rng, B) {
    var remaining = new Map(), assign = new Map(), i = 0, k, v;
    need.forEach(function (cnt, p) { remaining.set(p, cnt); });

    /* 4a. 先把「槽内已有若干张」的图案补齐，让占用立刻回落 */
    if (seedCounts) {
      var seeded = [];
      seedCounts.forEach(function (s, p) { if (s > 0) seeded.push({ p: p, s: s }); });
      seeded.sort(function (a, b) { return b.s - a.s; });
      for (var si = 0; si < seeded.length; si++) {
        var want = (3 - seeded[si].s) % 3;
        var have = remaining.get(seeded[si].p) || 0;
        var take = Math.min(want, have);
        for (var c = 0; c < take; c++) {
          assign.set(order[i++], seeded[si].p);
          remaining.set(seeded[si].p, have - 1 - c);
        }
        if (i >= order.length) break;
      }
    }

    /* 4b. 分块回填 */
    var guard = 0;
    while (i < order.length && guard++ < 200000) {
      var left = order.length - i;
      var avail = [];
      remaining.forEach(function (cnt, p) { if (cnt >= 3) avail.push(p); });
      if (!avail.length) break;
      var gcount = Math.min(B, Math.floor(left / 3), avail.length);
      if (gcount <= 0) break;
      var groups = [], g;
      for (g = 0; g < gcount; g++) {
        var cand = avail.filter(function (p) { return remaining.get(p) >= 3; });
        if (!cand.length) break;
        var p = cand[Math.floor(rng() * cand.length)];
        groups.push(p);
        remaining.set(p, remaining.get(p) - 3);
      }
      if (!groups.length) break;
      var seq = [], q, r;
      if (groups.length >= 2 && rng() < 0.7) {
        /* 轮转交织：占用能顶到 2B，难度更高 */
        var base = UU.shuffleArr(groups.slice(), rng);
        for (r = 0; r < 3; r++) for (q = 0; q < base.length; q++) seq.push(base[q]);
      } else {
        var ms = [];
        for (q = 0; q < groups.length; q++) { ms.push(groups[q], groups[q], groups[q]); }
        seq = UU.shuffleArr(ms, rng);
      }
      for (var s = 0; s < seq.length && i < order.length; s++, i++) assign.set(order[i], seq[s]);
    }

    /* 4c. 尾部补齐（洗牌时张数可能不是 3 的倍数） */
    while (i < order.length) {
      var rest = [];
      remaining.forEach(function (cnt, p) { if (cnt > 0) rest.push(p); });
      if (!rest.length) return null;
      var p2 = rest[Math.floor(rng() * rest.length)];
      assign.set(order[i], p2);
      remaining.set(p2, remaining.get(p2) - 1);
      i++;
    }
    return assign;
  }

  /* 兜底方案：每个图案的牌连续摆放，槽位峰值 ≤ 初始占用 + 2，绝对安全 */
  function assignChunked(order, need, seedCounts) {
    var pats = [];
    need.forEach(function (n, p) { pats.push({ p: p, n: n, s: (seedCounts && seedCounts.get(p)) || 0 }); });
    pats.sort(function (a, b) { return b.s - a.s; });
    var assign = new Map(), i = 0;
    for (var pi = 0; pi < pats.length; pi++) {
      for (var c = 0; c < pats[pi].n; c++) {
        if (i >= order.length) return null;
        assign.set(order[i++], pats[pi].p);
      }
    }
    return i === order.length ? assign : null;
  }

  /* ---------- 5. 重放校验：按真实规则走一遍这条清空序 ---------- */
  function replayCheck(order, assign, seedCounts, slotMax) {
    var slot = new Map(), occ = 0, i;
    if (seedCounts) seedCounts.forEach(function (v, p) { slot.set(p, v); occ += v; });
    var peak = occ;
    for (i = 0; i < order.length; i++) {
      var p = assign.get(order[i]);
      if (p === undefined) return { ok: false, peak: peak, reason: 'unassigned' };
      var s = slot.get(p) || 0;
      if (s === 2) { slot.set(p, 0); occ -= 2; }
      else { slot.set(p, s + 1); occ += 1; }
      if (occ > slotMax) return { ok: false, peak: peak, reason: 'overflow' };
      if (occ > peak) peak = occ;
    }
    var left = 0;
    slot.forEach(function (v) { left += v; });
    return { ok: left === 0, peak: peak, left: left, reason: left === 0 ? '' : 'leftover' };
  }

  /* ---------- 6. 质量度量 ---------- */
  function measure(tiles, peak) {
    var covered = 0, sumB = 0, free = {}, i;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      sumB += t.blockers;
      if (t.blockers > 0) covered++;
      else free[t.pat] = (free[t.pat] || 0) + 1;
    }
    return {
      total: tiles.length,
      coverage: covered / tiles.length,
      avgBlockers: sumB / tiles.length,
      freeTiles: tiles.length - covered,
      startPatterns: Object.keys(free).length,
      peak: peak
    };
  }

  /* ---------- 7. 生成一局 ---------- */
  function generate(cfg, seed, opts) {
    var total = G.totalOf(cfg);
    var patterns = Math.min(cfg.patterns, G.ICONS.length);
    var B = cfg.block || 2;
    var quiet = opts && opts.quiet;

    for (var attempt = 0; attempt < 60; attempt++) {
      var sd = (seed + attempt * 7919) >>> 0;
      var rng = UU.mulberry32(sd);
      var tiles = buildLayout(cfg, rng);
      if (tiles.length !== total) continue;
      var size = G.geom.normalize(tiles);
      G.geom.buildOcclusion(tiles);
      var order = witnessOrderOf(tiles, rng);
      if (order.length !== total) continue;

      var counts = distribute(total / 3, patterns);
      var need = new Map();
      for (var i = 0; i < counts.length; i++) if (counts[i] > 0) need.set(i, counts[i]);

      var assign = assignPlan(order, need, null, rng, B);
      if (!assign || assign.size !== total) continue;
      var chk = replayCheck(order, assign, null, G.C.SLOT_MAX);
      if (!chk.ok) continue;

      for (var j = 0; j < tiles.length; j++) tiles[j].pat = assign.get(tiles[j].id);
      return {
        tiles: tiles, order: order, assign: assign,
        boardW: size.w, boardH: size.h,
        peak: chk.peak, metrics: measure(tiles, chk.peak), seed: sd
      };
    }
    if (!quiet) console.warn('[generator] 生成失败，回退到最低难度参数', cfg.id);
    throw new Error('generate failed: ' + cfg.id);
  }

  /* ---------- 8. 洗牌：不改位置与遮挡，只重排图案，且保证仍可解 ---------- */
  function rebuildBoard(state, rng, cap) {
    var board = state.tiles.filter(function (t) { return t.state === 'board'; });
    if (!board.length) return { ok: false, reason: 'empty' };

    var seedCounts = new Map(), need = new Map();
    state.tiles.forEach(function (t) {
      if (t.state === 'slot' || t.state === 'stage') {
        seedCounts.set(t.pat, (seedCounts.get(t.pat) || 0) + 1);
      } else if (t.state === 'board') {
        need.set(t.pat, (need.get(t.pat) || 0) + 1);
      }
    });

    var occ = 0;
    seedCounts.forEach(function (v) { occ += v; });
    var limit = cap || (G.C.SLOT_MAX - 1);
    var B = Math.max(1, Math.min(state.cfg.block || 2, Math.floor((limit - occ) / 2)));

    for (var attempt = 0; attempt < 40; attempt++) {
      var order = witnessOrderOf(board, rng);
      if (order.length !== board.length) return { ok: false, reason: 'order' };
      var a = assignPlan(order, new Map(need), seedCounts, rng, B);
      if (!a || a.size !== board.length) continue;
      var chk = replayCheck(order, a, seedCounts, G.C.SLOT_MAX);
      if (!chk.ok) continue;
      var changed = applyPatterns(board, a);
      return { ok: true, changed: changed, peak: chk.peak, order: order };
    }

    /* 兜底：连续摆放，峰值 ≤ 初始占用 + 2 */
    var order2 = witnessOrderOf(board, UU.mulberry32(0x1234));
    var a2 = assignChunked(order2, new Map(need), seedCounts);
    if (a2) {
      var chk2 = replayCheck(order2, a2, seedCounts, G.C.SLOT_MAX);
      if (chk2.ok) {
        var changed2 = applyPatterns(board, a2);
        return { ok: true, changed: changed2, peak: chk2.peak, order: order2, fallback: true };
      }
    }
    return { ok: false, reason: 'unsolvable' };
  }

  function applyPatterns(board, assign) {
    var changed = 0;
    for (var i = 0; i < board.length; i++) {
      var np = assign.get(board[i].id);
      if (np !== undefined && np !== board[i].pat) { board[i].pat = np; changed++; }
      else if (np !== undefined) { board[i].pat = np; }
    }
    return changed / board.length;
  }

  G.gen = {
    gridFor: gridFor,
    layerCells: layerCells,
    buildLayout: buildLayout,
    witnessOrderOf: witnessOrderOf,
    distribute: distribute,
    assignPlan: assignPlan,
    replayCheck: replayCheck,
    generate: generate,
    rebuildBoard: rebuildBoard,
    measure: measure
  };
})(window.G = window.G || {});
