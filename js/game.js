/* game.js —— 状态机：点击 / 消除 / 道具 / 存档 */
(function (G) {
  'use strict';
  var U = G.util;
  var SLOT_MAX = G.C.SLOT_MAX;

  var game = {
    state: null,

    /* 开一局 */
    create: function (cfg, seedOverride) {
      var seed = (seedOverride == null) ? cfg.seed : seedOverride;
      var g = G.gen.generate(cfg, seed);
      var st = {
        cfg: cfg,
        tiles: g.tiles,
        order: g.order,
        slot: [],
        stage: [],
        props: {
          undo: cfg.props.undo,
          move: cfg.props.move,
          shuffle: cfg.props.shuffle
        },
        status: 'playing',
        undoOk: false,
        peak: g.peak,
        metrics: g.metrics,
        boardW: g.boardW,
        boardH: g.boardH,
        seed: g.seed,
        shuffleRng: U.mulberry32((g.seed ^ 0x9e3779b9) >>> 0)
      };
      this.state = st;
      return st;
    },

    leftCount: function () {
      var s = this.state, n = 0;
      for (var i = 0; i < s.tiles.length; i++) if (s.tiles[i].state !== 'gone') n++;
      return n;
    },

    /* 点一张牌 */
    pick: function (id) {
      var s = this.state;
      if (!s || s.status !== 'playing') return { ok: false, reason: 'over' };
      var t = s.tiles[id];
      if (!t || t.state !== 'board') return { ok: false, reason: 'gone' };
      if (t.blockers > 0) return { ok: false, reason: 'blocked' };
      if (s.slot.length >= SLOT_MAX) return { ok: false, reason: 'full' };

      t.state = 'slot';
      s.slot.push(id);
      var slotIndex = s.slot.length - 1;
      for (var i = 0; i < t.blocks.length; i++) s.tiles[t.blocks[i]].blockers--;

      var eliminated = this._settle();
      s.undoOk = eliminated.length === 0;
      var status = this._status();
      s.status = status;
      return { ok: true, slotIndex: slotIndex, eliminated: eliminated, status: status };
    },

    /* 槽内三张同图案即消除（不要求相邻） */
    _settle: function () {
      var s = this.state;
      var counts = {};
      for (var i = 0; i < s.slot.length; i++) {
        var p = s.tiles[s.slot[i]].pat;
        counts[p] = (counts[p] || 0) + 1;
      }
      var hit = null;
      for (var k in counts) {
        if (counts[k] >= 3) { hit = +k; break; }
      }
      if (hit === null) return [];
      var ids = [];
      for (var j = 0; j < s.slot.length && ids.length < 3; j++) {
        if (s.tiles[s.slot[j]].pat === hit) ids.push(s.slot[j]);
      }
      s.slot = s.slot.filter(function (id) { return ids.indexOf(id) < 0; });
      for (var m = 0; m < ids.length; m++) s.tiles[ids[m]].state = 'gone';
      return ids;
    },

    _status: function () {
      var s = this.state, i;
      if (s.slot.length >= SLOT_MAX) return 'lost';
      for (i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i].state !== 'gone') return 'playing';
      }
      return 'won';
    },

    /* 撤销：把槽内最后一张退回原位 */
    undo: function () {
      var s = this.state;
      if (!s || s.status !== 'playing') return { ok: false, reason: 'over' };
      if (s.props.undo <= 0) return { ok: false, reason: 'empty' };
      if (!s.undoOk || !s.slot.length) return { ok: false, reason: 'none' };
      var id = s.slot.pop();
      var t = s.tiles[id];
      t.state = 'board';
      for (var i = 0; i < t.blocks.length; i++) s.tiles[t.blocks[i]].blockers++;
      s.props.undo--;
      s.undoOk = false;
      return { ok: true, id: id };
    },

    /* 移出：把槽内最没用的 3 张挪到暂存区 */
    moveOut: function () {
      var s = this.state;
      if (!s || s.status !== 'playing') return { ok: false, reason: 'over' };
      if (s.props.move <= 0) return { ok: false, reason: 'empty' };
      if (s.stage.length) return { ok: false, reason: 'stageFull' };
      if (!s.slot.length) return { ok: false, reason: 'none' };

      var counts = {};
      s.slot.forEach(function (id) {
        var p = s.tiles[id].pat;
        counts[p] = (counts[p] || 0) + 1;
      });
      var scored = s.slot.map(function (id, i) {
        return { id: id, i: i, c: counts[s.tiles[id].pat] };
      });
      scored.sort(function (a, b) {
        if (a.c !== b.c) return a.c - b.c;   /* 该图案在槽内越少越先移出 */
        return b.i - a.i;                     /* 同分取更靠后的 */
      });
      var ids = scored.slice(0, Math.min(G.C.STAGE_MAX, scored.length)).map(function (x) { return x.id; });

      s.slot = s.slot.filter(function (id) { return ids.indexOf(id) < 0; });
      s.stage = ids.slice();
      ids.forEach(function (id) { s.tiles[id].state = 'stage'; });
      s.props.move--;
      s.undoOk = false;
      return { ok: true, ids: ids };
    },

    /* 暂存牌放回槽位（可能因此凑成三消） */
    returnStage: function () {
      var s = this.state;
      if (!s || s.status !== 'playing') return { ok: false, reason: 'over' };
      if (!s.stage.length) return { ok: false, reason: 'none' };
      var eliminated = [], moved = [];
      var pending = s.stage.slice();
      for (var i = 0; i < pending.length; i++) {
        if (s.slot.length >= SLOT_MAX) break;
        var id = pending[i];
        var idx = s.stage.indexOf(id);
        if (idx < 0) continue;
        s.stage.splice(idx, 1);
        s.tiles[id].state = 'slot';
        s.slot.push(id);
        moved.push(id);
        eliminated = eliminated.concat(this._settle());
      }
      var status = this._status();
      s.status = status;
      return { ok: true, moved: moved, eliminated: eliminated, status: status };
    },

    /* 洗牌：只重排盘面图案，保证重排后依然可解 */
    shuffle: function () {
      var s = this.state;
      if (!s || s.status !== 'playing') return { ok: false, reason: 'over' };
      if (s.props.shuffle <= 0) return { ok: false, reason: 'empty' };
      if (s.stage.length) return { ok: false, reason: 'stageFull' };
      var r = G.gen.rebuildBoard(s, s.shuffleRng, G.C.SLOT_MAX - 1);
      if (!r.ok) return { ok: false, reason: 'fail' };
      s.props.shuffle--;
      /* 洗牌会产出一条新的合法清空序，写回 state.order，
         这样「洗牌后是否仍可解」才能被自动化确认 */
      if (r.order) s.order = r.order;
      return { ok: true, changed: r.changed, peak: r.peak };
    },

    /* 无头模拟一局（难度度量用）：noise = 乱点概率 */
    simulate: function (srcTiles, noise, rng) {
      var tiles = srcTiles.map(function (t) {
        return { id: t.id, pat: t.pat, layer: t.layer, blockers: t.blockers, blocks: t.blocks.slice(), state: 'board', ux: t.ux, uy: t.uy };
      });
      var slot = [], guard = 0;
      var settle = function () {
        var counts = {}, i, k;
        for (i = 0; i < slot.length; i++) {
          var p = tiles[slot[i]].pat;
          counts[p] = (counts[p] || 0) + 1;
        }
        for (k in counts) {
          if (counts[k] >= 3) {
            var pat = +k, ids = [];
            for (i = 0; i < slot.length && ids.length < 3; i++) if (tiles[slot[i]].pat === pat) ids.push(slot[i]);
            slot = slot.filter(function (id) { return ids.indexOf(id) < 0; });
            ids.forEach(function (id) { tiles[id].state = 'gone'; });
            return true;
          }
        }
        return false;
      };
      while (guard++ < 4000) {
        var free = [];
        for (var i = 0; i < tiles.length; i++) {
          if (tiles[i].state === 'board' && tiles[i].blockers === 0) free.push(tiles[i]);
        }
        if (!free.length) break;
        var choice;
        if (rng() < noise) {
          choice = free[Math.floor(rng() * free.length)];
        } else {
          var best = -1, pool = [];
          var cnt = {};
          slot.forEach(function (id) { cnt[tiles[id].pat] = (cnt[tiles[id].pat] || 0) + 1; });
          for (i = 0; i < free.length; i++) {
            var c = cnt[free[i].pat] || 0;
            if (c > best) { best = c; pool = [free[i]]; }
            else if (c === best) pool.push(free[i]);
          }
          choice = pool[Math.floor(rng() * pool.length)];
        }
        choice.state = 'slot';
        slot.push(choice.id);
        for (var b = 0; b < choice.blocks.length; b++) tiles[choice.blocks[b]].blockers--;
        settle();
        if (slot.length >= SLOT_MAX) return 'lost';
        var allGone = tiles.every(function (t) { return t.state === 'gone'; });
        if (allGone) return 'won';
      }
      return 'lost';
    }
  };

  G.game = game;
})(window.G = window.G || {});
