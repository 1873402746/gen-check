/* main.js —— 启动 / 关卡流程 / 按钮绑定 / 调试钩子 */
(function (G) {
  'use strict';
  var U = G.util;
  var save = U.loadSave();
  var cur = null;          /* { key, endlessN, cfg } */
  var pending = 'retry';
  var lastResult = null;

  var MSG = {
    over: '这一局已经结束了',
    gone: '这张牌已经拿走了',
    blocked: '这张牌被压住了',
    full: '槽位已满',
    empty: '道具次数用完了',
    stageFull: '先把暂存区的牌放回槽位',
    none: '暂时没有可用的牌',
    fail: '操作失败，请重试'
  };

  function createSafe(cfg, seed) {
    var lastErr = null;
    for (var i = 0; i < 6; i++) {
      var sd = (seed == null ? cfg.seed : seed) ^ (i * 104729);
      try { return G.game.create(cfg, sd >>> 0); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('create failed');
  }

  /* 每局现取随机种子。
   * 之前这里用的是固定 cfg.seed —— 同一关每次盘面一模一样，玩家死两三次就能背下来，
   * 这才是「难度上不去」的真正原因。随机化之后收益全靠临场判断。 */
  function freshSeed() {
    return (((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  }

  function newGame(cfg, meta, seed) {
    var state;
    try { state = createSafe(cfg, seed == null ? freshSeed() : seed); }
    catch (e) {
      G.UI.toast('生成失败，请刷新页面重试');
      console.error(e);
      return;
    }
    cur = meta;
    cur.cfg = cfg;
    G.UI.hideResult();
    G.UI.showScreen('game');
    G.UI.startGame(state);
  }

  /* ---------------- 首页 ---------------- */
  function bindHome() {
    U.byId('levelList').addEventListener('click', function (e) {
      var btn = e.target.closest('.lv');
      if (!btn) return;
      var key = btn.dataset.level;
      G.audio.unlock();
      if (key === 'l1') return newGame(G.LEVELS.l1, { key: 'l1' });
      if (key === 'l2') {
        if (save.unlocked < 2) return G.UI.toast('先通过第 1 关才能解锁');
        return newGame(G.LEVELS.l2, { key: 'l2' });
      }
      if (save.unlocked < 3) return G.UI.toast('通过第 2 关才能解锁无限模式');
      return newGame(G.endlessCfg(1), { key: 'endless', endlessN: 1 });
    });
    U.byId('btnSound').addEventListener('click', function () {
      save.muted = !save.muted;
      G.audio.setMuted(save.muted);
      U.saveSave(save);
      G.UI.renderHome(save);
      syncMuteBtn();
    });
  }

  function syncMuteBtn() {
    var b = U.byId('btnMute');
    if (b) b.textContent = save.muted ? '🔇' : '🔊';
  }

  /* ---------------- 对局按钮 ---------------- */
  function bindGame() {
    U.byId('btnBack').addEventListener('click', function () {
      G.UI.freeze();
      G.UI.showScreen('home');
      G.UI.hideResult();
      G.UI.renderHome(save);
      cur = null;
    });

    U.byId('btnMute').addEventListener('click', function () {
      save.muted = !save.muted;
      G.audio.setMuted(save.muted);
      U.saveSave(save);
      syncMuteBtn();
      G.UI.renderHome(save);
    });

    U.byId('props').addEventListener('click', function (e) {
      var btn = e.target.closest('.prop');
      if (!btn || !cur) return;
      var p = btn.dataset.prop;
      var r;
      if (p === 'undo') r = G.game.undo();
      else if (p === 'move') r = G.game.moveOut();
      else r = G.game.shuffle();

      if (!r.ok) {
        if (r.reason === 'none' && p === 'undo') return G.UI.toast('槽里没有可撤销的牌');
        return G.UI.toast(MSG[r.reason] || '操作失败');
      }
      G.audio.prop();
      G.UI.syncAll();
      if (p === 'undo') {
        G.UI.toast('已撤销');
      } else if (p === 'move') {
        G.UI.toast('已移出 ' + r.ids.length + ' 张，点暂存区可放回');
      } else {
        G.UI.toast('已重新洗牌');
      }
    });
  }

  /* ---------------- 结算 ---------------- */
  function bindResult() {
    U.byId('btnNext').addEventListener('click', function () {
      G.UI.hideResult();
      if (!cur) return;
      if (pending === 'retry') {
        return newGame(cur.cfg, { key: cur.key, endlessN: cur.endlessN });
      }
      if (cur.key === 'l1') return newGame(G.LEVELS.l2, { key: 'l2' });
      if (cur.key === 'l2') return newGame(G.endlessCfg(1), { key: 'endless', endlessN: 1 });
      var n = (cur.endlessN || 1) + 1;
      return newGame(G.endlessCfg(n), { key: 'endless', endlessN: n });
    });

    U.byId('btnHome').addEventListener('click', function () {
      G.UI.hideResult();
      G.UI.freeze();
      G.UI.showScreen('home');
      G.UI.renderHome(save);
      cur = null;
    });

    U.byId('btnPoster').addEventListener('click', function () {
      if (!lastResult) return;
      G.UI.makePoster(lastResult).then(function (url) {
        G.UI.showPoster(url);
      }).catch(function (e) {
        console.error(e);
        G.UI.toast('海报生成失败');
      });
    });

    U.byId('btnClosePoster').addEventListener('click', function () {
      U.byId('posterOverlay').classList.remove('show');
    });
  }

  /* ---------------- 胜负回调 ---------------- */
  function onWin() {
    if (!cur) return;
    G.UI.freeze();
    var ms = G.UI.elapsed();
    var key = cur.key;

    if (key === 'l1') {
      if (save.best.l1 == null || ms < save.best.l1) save.best.l1 = ms;
      if (save.unlocked < 2) save.unlocked = 2;
    } else if (key === 'l2') {
      if (save.best.l2 == null || ms < save.best.l2) save.best.l2 = ms;
      if (save.unlocked < 3) save.unlocked = 3;
    } else {
      if ((cur.endlessN || 0) > (save.best.endless || 0)) save.best.endless = cur.endlessN;
    }
    U.saveSave(save);
    G.UI.renderHome(save);

    var best = key === 'l1' ? save.best.l1 : (key === 'l2' ? save.best.l2 : null);
    var rows = [
      ['关卡', cur.cfg.name],
      ['本次用时', U.fmtTime(ms)],
      ['最佳用时', best == null ? '--' : U.fmtTime(best)]
    ];
    var nextLabel = key === 'l1' ? '进入第 2 关' : (key === 'l2' ? '挑战无限模式' : '下一关');
    pending = 'next';
    lastResult = {
      title: '通关！', sub: cur.cfg.name + ' · 用时 ' + U.fmtTime(ms),
      rows: rows, host: location.protocol === 'file:' ? '本机离线版' : location.host
    };
    G.UI.showResult('通关！', cur.cfg.name + ' · 用时 ' + U.fmtTime(ms), rows, nextLabel);
  }

  function onLose() {
    if (!cur) return;
    G.UI.freeze();
    var ms = G.UI.elapsed();
    var gone = 0;
    G.game.state.tiles.forEach(function (t) { if (t.state === 'gone') gone++; });
    var left = G.game.leftCount();
    var rows = [
      ['关卡', cur.cfg.name],
      ['已消除', gone + ' 张'],
      ['剩余', left + ' 张']
    ];
    pending = 'retry';
    lastResult = {
      title: '差一点点', sub: cur.cfg.name + ' · 坚持了 ' + U.fmtTime(ms),
      rows: rows, accent: '#7d6a62',
      host: location.protocol === 'file:' ? '本机离线版' : location.host
    };
    G.UI.showResult('差一点点', '槽位满了 · 坚持了 ' + U.fmtTime(ms), rows, '再来一次');
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    G.UI.init();
    G.audio.setMuted(save.muted);
    syncMuteBtn();
    G.UI.renderHome(save);
    bindHome();
    bindGame();
    bindResult();
    G.UI.on('win', onWin);
    G.UI.on('lose', onLose);
    G.UI.showScreen('home');

    /* 首次任意交互解锁音频（iOS 要求） */
    document.addEventListener('pointerdown', function once() {
      G.audio.unlock();
      document.removeEventListener('pointerdown', once);
    }, { once: true });
  }

  /* ---------------- 调试钩子（供自动化验收） ---------------- */
  G.debug = {
    save: function () { return save; },
    newGame: newGame,
    startLevel: function (key, n, seed) {
      if (key === 'endless') return newGame(G.endlessCfg(n || 1), { key: 'endless', endlessN: n || 1 }, seed);
      return newGame(G.LEVELS[key], { key: key }, seed);
    },
    state: function () { return G.game.state; },
    metrics: function () { return G.game.state ? G.game.state.metrics : null; },
    solution: function () { return G.game.state ? G.game.state.order.slice() : []; },
    playSolution: function () {
      var st = G.game.state;
      if (!st || st.status !== 'playing') return false;
      G.UI.setFast(true);
      var order = st.order.slice();
      for (var i = 0; i < order.length; i++) {
        var t = st.tiles[order[i]];
        if (!t || t.state !== 'board' || t.blockers > 0) continue;
        G.UI.pickById(order[i]);
        if (st.status !== 'playing') break;
      }
      G.UI.setFast(false);
      G.UI.syncAll();
      return st.status === 'won';
    },
    fillSlotToLose: function () {
      var st = G.game.state;
      if (!st) return { status: 'none' };
      G.UI.setFast(true);
      var guard = 0;
      while (st.status === 'playing' && st.slot.length < G.C.SLOT_MAX && guard++ < 200) {
        var cnt = {};
        st.slot.forEach(function (id) { cnt[st.tiles[id].pat] = (cnt[st.tiles[id].pat] || 0) + 1; });
        var free = st.tiles.filter(function (t) { return t.state === 'board' && t.blockers === 0; });
        if (!free.length) break;
        var cand = free.filter(function (t) { return (cnt[t.pat] || 0) < 2; });
        if (!cand.length) cand = free;
        G.UI.pickById(cand[0].id);
      }
      G.UI.setFast(false);
      G.UI.syncAll();
      return { status: st.status, slot: st.slot.length };
    },
    doublePickTest: function () {
      var st = G.game.state;
      if (!st) return -1;
      var before = st.slot.length;
      var free = st.tiles.filter(function (t) { return t.state === 'board' && t.blockers === 0; })[0];
      if (!free) return -1;
      G.UI.pickById(free.id);
      G.UI.pickById(free.id);
      G.UI.pickById(free.id);
      return st.slot.length - before;
    },
    simulate: function (n, noise, seed) {
      var tiles = G.game.state.tiles;
      var rng = U.mulberry32(seed || 12345);
      var win = 0;
      for (var i = 0; i < n; i++) {
        if (G.game.simulate(tiles, noise, rng) === 'won') win++;
      }
      return win / n;
    },
    overlayShown: function (id) {
      var el = U.byId(id || 'overlay');
      return !!(el && el.classList.contains('show'));
    }
  };

  boot();
})(window.G = window.G || {});
