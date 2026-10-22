/* ui.js —— 渲染 / 动画 / HUD / 结算 / 海报 */
(function (G) {
  'use strict';
  var U = G.util;

  var unitPx = G.C.TILE_PX / G.C.UNIT;
  var elMap = {};
  var boardScale = 1;
  var timer = null;
  var startedAt = 0;
  var frozenMs = 0;
  var toastTimer = null;
  var hintTimer = null;

  var D = {};
  var st = null;

  function cache() {
    D.board = U.byId('board');
    D.stageWrap = U.byId('stageWrap');
    D.slot = U.byId('slot');
    D.tray = U.byId('tray');
    D.fly = U.byId('flyLayer');
    D.hudTime = U.byId('hudTime');
    D.hudLeft = U.byId('hudLeft');
    D.hudLevel = U.byId('hudLevel');
    D.slotCells = U.qsa('#slot .slot-cell');
    D.trayCells = U.qsa('#tray .tray-cell');
    D.hint = U.byId('hint');
    D.toast = U.byId('toast');
  }

  /* ---------------- 首页 ---------------- */
  function renderHome(save) {
    var list = U.byId('levelList');
    var rows = [
      { id: 'l1', name: '第 1 关', desc: '36 张 · 轻松热身', badge: '1' },
      { id: 'l2', name: '第 2 关', desc: '126 张 · 地狱难度', badge: '2' },
      { id: 'endless', name: '无限模式', desc: '每过一关 +1 层，挑战极限', badge: '∞' }
    ];
    var html = '';
    rows.forEach(function (r) {
      var locked = (r.id === 'l2' && save.unlocked < 2) || (r.id === 'endless' && save.unlocked < 3);
      html += '<button class="lv' + (locked ? ' locked' : '') + '" data-level="' + r.id + '">' +
        '<span class="lv-badge">' + r.badge + '</span>' +
        '<span class="lv-txt"><span class="lv-name">' + r.name + '</span>' +
        '<span class="lv-desc">' + r.desc + '</span></span>' +
        '<span class="lv-go">' + (locked ? '' : '开始 ›') + '</span></button>';
    });
    list.innerHTML = html;

    var best = [];
    best.push('第 1 关最佳：' + (save.best.l1 == null ? '--' : U.fmtTime(save.best.l1)));
    best.push('第 2 关最佳：' + (save.best.l2 == null ? '--' : U.fmtTime(save.best.l2)));
    best.push('无限模式最远：第 ' + (save.best.endless || 0) + ' 关');
    U.byId('homeBest').innerHTML = best.join('<br>');

    var btn = U.byId('btnSound');
    btn.textContent = save.muted ? '🔇 音效关' : '🔊 音效开';
  }

  /* ---------------- 画面切换 ---------------- */
  function showScreen(name) {
    U.qsa('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = U.byId('screen-' + name);
    if (el) el.classList.add('active');
  }

  /* ---------------- 棋盘 ---------------- */
  function buildTiles(state) {
    st = state;
    D.board.innerHTML = '';
    elMap = {};
    var frag = document.createDocumentFragment();
    state.tiles.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tile';
      el.dataset.id = t.id;
      el.style.setProperty('--tx', (t.ux * unitPx) + 'px');
      el.style.setProperty('--ty', (t.uy * unitPx) + 'px');
      el.style.zIndex = String(t.layer * 100 + t.uy);
      el.innerHTML = '<svg viewBox="0 0 64 64"><use href="#i-' + G.ICONS[t.pat] + '"></use></svg>';
      el.__pat = t.pat;
      elMap[t.id] = el;
      frag.appendChild(el);
    });
    D.board.appendChild(frag);
  }

  function fit() {
    if (!st) return;
    var bw = st.boardW * unitPx;
    var bh = st.boardH * unitPx;
    D.board.style.width = bw + 'px';
    D.board.style.height = bh + 'px';
    var aw = Math.max(80, D.stageWrap.clientWidth - 8);
    var ah = Math.max(80, D.stageWrap.clientHeight - 8);
    var s = Math.min(aw / bw, ah / bh, 1.45);
    boardScale = s;
    D.board.style.transform = 'translate(-50%,-50%) scale(' + s.toFixed(4) + ')';
  }

  function syncBoard() {
    if (!st) return;
    st.tiles.forEach(function (t) {
      var el = elMap[t.id];
      if (!el) return;
      if (el.__pat !== t.pat) {
        el.__pat = t.pat;
        var use = el.querySelector('use');
        if (use) use.setAttribute('href', '#i-' + G.ICONS[t.pat]);
      }
      if (t.state === 'board') {
        if (el.parentNode !== D.board) {
          el.classList.remove('in-slot');
          el.style.visibility = '';
          D.board.appendChild(el);
        }
        el.classList.toggle('covered', t.blockers > 0);
      } else if (el.parentNode === D.board) {
        D.board.removeChild(el);
      }
    });
  }

  function syncSlot() {
    if (!st) return;
    for (var i = 0; i < D.slotCells.length; i++) {
      var cell = D.slotCells[i];
      var id = st.slot[i];
      var want = (id == null) ? null : elMap[id];
      var kids = Array.prototype.slice.call(cell.children);
      for (var k = 0; k < kids.length; k++) {
        if (kids[k] !== want) cell.removeChild(kids[k]);
      }
      if (want) {
        if (want.parentNode !== cell) {
          want.classList.add('in-slot');
          cell.appendChild(want);
        }
        want.classList.remove('covered');
        want.style.visibility = '';
      }
    }
    D.slot.classList.toggle('danger', st.slot.length >= G.C.SLOT_MAX - 1);

    for (var j = 0; j < D.trayCells.length; j++) {
      var tcell = D.trayCells[j];
      var tid = st.stage[j];
      var twant = (tid == null) ? null : elMap[tid];
      var tk = Array.prototype.slice.call(tcell.children);
      for (var m = 0; m < tk.length; m++) {
        if (tk[m] !== twant) tcell.removeChild(tk[m]);
      }
      if (twant) {
        if (twant.parentNode !== tcell) {
          twant.classList.add('in-slot');
          tcell.appendChild(twant);
        }
        twant.classList.remove('covered');
        twant.style.visibility = '';
      }
    }
    D.tray.classList.toggle('has', st.stage.length > 0);
  }

  function syncHud() {
    if (!st) return;
    var left = 0;
    st.tiles.forEach(function (t) { if (t.state === 'board') left++; });
    D.hudLeft.textContent = '剩 ' + left + ' 张';
    D.hudLevel.textContent = st.cfg.name;
    ['undo', 'move', 'shuffle'].forEach(function (k) {
      var n = st.props[k] || 0;
      var cnt = U.byId('cnt-' + k);
      if (cnt) cnt.textContent = n;
      var btn = U.qs('.prop[data-prop="' + k + '"]');
      if (btn) btn.classList.toggle('dim', n <= 0);
    });
  }

  function syncAll() {
    syncBoard();
    syncSlot();
    syncHud();
  }

  /* ---------------- 动画 ---------------- */
  function cloneBox(pat, rect) {
    var c = document.createElement('div');
    c.className = 'fly';
    c.style.left = rect.left + 'px';
    c.style.top = rect.top + 'px';
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
    c.innerHTML = '<svg viewBox="0 0 64 64"><use href="#i-' + G.ICONS[pat] + '"></use></svg>';
    D.fly.appendChild(c);
    return c;
  }

  function flyClone(pat, from, to, dur, cb) {
    if (!from || !to) { if (cb) cb(); return; }
    var c = cloneBox(pat, from);
    var dx = to.left - from.left, dy = to.top - from.top;
    var sc = from.width ? (to.width / from.width) : 1;
    try {
      var anim = c.animate([
        { transform: 'translate3d(0,0,0) scale(1)' },
        { transform: 'translate3d(' + (dx * 0.55) + 'px,' + (dy * 0.55 - 26) + 'px,0) scale(' + (1 + (sc - 1) * 0.6) + ')', offset: 0.6 },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + sc + ')' }
      ], { duration: dur, easing: 'cubic-bezier(.3,.8,.35,1)' });
      anim.onfinish = function () { c.remove(); if (cb) cb(); };
      anim.oncancel = function () { c.remove(); if (cb) cb(); };
    } catch (e) { c.remove(); if (cb) cb(); }
  }

  function spawnPop(pat, rect, delay) {
    if (!rect) return;
    var c = cloneBox(pat, rect);
    try {
      var a = c.animate([
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.16)', opacity: 1, offset: 0.55 },
        { transform: 'scale(.35)', opacity: 0 }
      ], { duration: 200, delay: delay || 0, easing: 'ease-out', fill: 'both' });
      a.onfinish = function () { c.remove(); };
      a.oncancel = function () { c.remove(); };
    } catch (e) { c.remove(); }
  }

  function bump(el) {
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    setTimeout(function () { el.classList.remove('bump'); }, 340);
  }

  /* ---------------- 交互 ---------------- */
  var down = null;

  function bindInput() {
    D.board.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest('.tile');
      down = el ? { id: +el.dataset.id, x: e.clientX, y: e.clientY } : null;
      G.audio.unlock();
    });
    D.board.addEventListener('pointerup', function (e) {
      if (!down) return;
      var d = down; down = null;
      if (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10) return;
      var el = e.target.closest && e.target.closest('.tile');
      if (!el || +el.dataset.id !== d.id) return;
      handlePick(d.id);
    });
    D.tray.addEventListener('pointerup', function (e) {
      var el = e.target.closest && e.target.closest('.tile');
      if (!el || !st || !st.stage.length) return;
      onReturnStage();
    });
  }

  var fast = false;

  function handlePick(id) {
    if (!st || st.status !== 'playing') return;
    var t = st.tiles[id];
    var el = elMap[id];
    if (!t || !el) return;
    if (t.state !== 'board') return;
    if (t.blockers > 0) { bump(el); G.audio.blocked(); return; }

    var fromRect = el.getBoundingClientRect();
    var res = G.game.pick(id);
    if (!res.ok) return;
    G.audio.pick();

    var elim = res.eliminated || [];
    var targetIdx = Math.min(res.slotIndex, G.C.SLOT_MAX - 1);
    var cellRect = D.slotCells[targetIdx].getBoundingClientRect();

    if (fast) {
      syncAll();
    } else if (elim.length === 0) {
      el.classList.add('in-slot');
      el.style.visibility = 'hidden';
      D.slotCells[targetIdx].appendChild(el);
      syncSlot();
      syncBoard();
      syncHud();
      flyClone(t.pat, fromRect, cellRect, 260, function () {
        el.style.visibility = '';
      });
    } else {
      var rects = {};
      elim.forEach(function (x) {
        if (x === id) { rects[x] = cellRect; return; }
        var e2 = elMap[x];
        rects[x] = (e2 && e2.parentNode) ? e2.getBoundingClientRect() : null;
        if (e2 && e2.parentNode) e2.parentNode.removeChild(e2);
      });
      if (el.parentNode) el.parentNode.removeChild(el);
      syncSlot();
      syncBoard();
      syncHud();
      elim.forEach(function (x) {
        if (x !== id) spawnPop(st.tiles[x].pat, rects[x], 260);
      });
      flyClone(t.pat, fromRect, cellRect, 260, function () {
        spawnPop(t.pat, rects[id], 0);
      });
      G.audio.match();
    }

    finishTurn(res);
  }

  function finishTurn(res) {
    if (res.status === 'lost') {
      setTimeout(function () { G.audio.fail(); emit('lose'); }, 460);
    } else if (res.status === 'won') {
      setTimeout(function () { G.audio.win(); emit('win'); }, 460);
    } else if (st.slot.length >= G.C.SLOT_MAX - 1 && !hasQuickMatch()) {
      hint('槽位快满了，试试道具');
    }
  }

  function hasQuickMatch() {
    if (!st) return true;
    for (var i = 0; i < st.slot.length; i++) {
      var p = st.tiles[st.slot[i]].pat;
      var need = 0;
      for (var j = 0; j < st.slot.length; j++) if (st.tiles[st.slot[j]].pat === p) need++;
      if (need >= 2) {
        for (var k = 0; k < st.tiles.length; k++) {
          var t = st.tiles[k];
          if (t.state === 'board' && t.blockers === 0 && t.pat === p) return true;
        }
      }
    }
    return false;
  }

  function onReturnStage() {
    var r = G.game.returnStage();
    if (!r.ok) return;
    G.audio.prop();
    syncSlot();
    syncHud();
    if (r.eliminated && r.eliminated.length) {
      G.audio.match();
      r.eliminated.forEach(function (x) { spawnPop(st.tiles[x].pat, null); });
    }
    if (r.status === 'won') setTimeout(function () { G.audio.win(); emit('win'); }, 260);
  }

  /* ---------------- 事件钩子 ---------------- */
  var listeners = {};
  function on(name, fn) { listeners[name] = fn; }
  function emit(name, data) { if (listeners[name]) listeners[name](data); }

  /* ---------------- 计时 ---------------- */
  var baseMs = 0, runStart = 0;

  function tick() {
    if (D.hudTime) D.hudTime.textContent = U.fmtTime(elapsed());
  }
  function elapsed() {
    return baseMs + (timer ? (Date.now() - runStart) : 0);
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function startTimer() {
    stopTimer();
    baseMs = 0;
    runStart = Date.now();
    tick();
    timer = setInterval(tick, 500);
  }
  function setElapsed(ms) {
    baseMs = Math.max(0, ms || 0);
    runStart = Date.now();
    tick();
  }
  function freeze() {
    if (timer) { baseMs = elapsed(); stopTimer(); }
  }
  function resume() {
    if (!timer) { runStart = Date.now(); timer = setInterval(tick, 500); }
  }

  /* ---------------- 提示 / toast ---------------- */
  function toast(msg) {
    if (!D.toast) return;
    D.toast.textContent = msg;
    D.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { D.toast.classList.remove('show'); }, 1600);
  }
  function hint(msg) {
    if (!D.hint) return;
    D.hint.textContent = msg;
    D.hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { D.hint.classList.remove('show'); }, 2200);
  }

  /* ---------------- 结算 ---------------- */
  function showResult(title, sub, rows, nextLabel) {
    U.byId('resTitle').textContent = title;
    U.byId('resSub').textContent = sub || '';
    U.byId('resStats').innerHTML = rows.map(function (r) {
      return '<div class="stat-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
    var nx = U.byId('btnNext');
    nx.textContent = nextLabel;
    nx.style.display = nextLabel ? '' : 'none';
    U.byId('overlay').classList.add('show');
  }
  function hideResult() { U.byId('overlay').classList.remove('show'); }

  /* ---------------- 海报 ---------------- */
  function iconData(name) {
    var sym = U.byId('i-' + name);
    var inner = sym ? sym.innerHTML : '';
    return 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' + inner + '</svg>');
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadIcon(name) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = iconData(name);
    });
  }

  function makePoster(info) {
    var W = 750, H = 1334;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var F = '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif';
    var names = ['carrot', 'strawberry', 'sheep', 'corn', 'mushroom', 'grape'];

    return Promise.all(names.map(loadIcon)).then(function (imgs) {
      var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, '#fffaf3');
      g.addColorStop(0.5, '#fff1dd');
      g.addColorStop(1, '#ffdcb4');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,163,92,.14)';
      ctx.beginPath(); ctx.arc(690, 90, 240, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(124,92,214,.08)';
      ctx.beginPath(); ctx.arc(60, 1210, 200, 0, Math.PI * 2); ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0462f';
      ctx.font = '800 78px ' + F;
      ctx.fillText('果了个果', W / 2, 176);
      ctx.fillStyle = '#b0907f';
      ctx.font = '400 26px ' + F;
      ctx.fillText('水 果 萌 宠 · 堆 叠 三 消', W / 2, 226);

      ctx.fillStyle = '#3d2b26';
      ctx.font = '800 104px ' + F;
      ctx.fillText(info.title, W / 2, 400);

      ctx.fillStyle = info.accent || '#e0462f';
      ctx.font = '500 30px ' + F;
      ctx.fillText(info.sub || '', W / 2, 456);

      /* 图标带 */
      var n = imgs.length, size = 96, gap = 16;
      var totalW = n * size + (n - 1) * gap;
      var sx = (W - totalW) / 2, sy = 540;
      for (var i = 0; i < n; i++) {
        var x = sx + i * (size + gap);
        ctx.save();
        ctx.shadowColor = 'rgba(120,80,50,.16)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#fff';
        rr(ctx, x, sy, size, size, 22);
        ctx.fill();
        ctx.restore();
        if (imgs[i]) {
          ctx.save();
          rr(ctx, x, sy, size, size, 22);
          ctx.clip();
          ctx.drawImage(imgs[i], x + 10, sy + 10, size - 20, size - 20);
          ctx.restore();
        }
      }

      /* 数据卡 */
      var cy = 700, ch = 300;
      ctx.save();
      ctx.shadowColor = 'rgba(120,80,50,.14)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      rr(ctx, 70, cy, W - 140, ch, 34);
      ctx.fill();
      ctx.restore();

      for (var r = 0; r < info.rows.length && r < 3; r++) {
        var ry = cy + 88 + r * 88;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#9c8578';
        ctx.font = '400 30px ' + F;
        ctx.fillText(info.rows[r][0], 118, ry);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#3d2b26';
        ctx.font = '700 40px ' + F;
        ctx.fillText(info.rows[r][1], W - 118, ry);
        if (r < 2) {
          ctx.strokeStyle = 'rgba(160,130,110,.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(118, ry + 32);
          ctx.lineTo(W - 118, ry + 32);
          ctx.stroke();
        }
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a7365';
      ctx.font = '400 28px ' + F;
      ctx.fillText('三张同图案即可消除，槽满 7 格就结束', W / 2, 1092);

      ctx.fillStyle = '#e0462f';
      ctx.font = '700 34px ' + F;
      ctx.fillText('来挑战一下，看你能过几关', W / 2, 1150);

      ctx.fillStyle = '#a8917f';
      ctx.font = '400 24px ' + F;
      ctx.fillText(info.host || '', W / 2, 1236);

      return cv.toDataURL('image/png');
    });
  }

  function showPoster(dataUrl) {
    U.byId('posterImg').src = dataUrl;
    var a = U.byId('btnDownload');
    a.href = dataUrl;
    U.byId('posterOverlay').classList.add('show');
  }

  /* ---------------- 对外 ---------------- */
  G.UI = {
    init: function () {
      cache();
      bindInput();
      window.addEventListener('resize', function () { fit(); });
      window.addEventListener('orientationchange', function () { setTimeout(fit, 120); });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { fit(); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) syncAll();
      });
    },
    on: on,
    renderHome: renderHome,
    showScreen: showScreen,
    startGame: function (state) {
      st = state;
      buildTiles(state);
      syncAll();
      fit();
      setTimeout(fit, 60);
      startTimer();
    },
    fit: fit,
    syncAll: syncAll,
    syncHud: syncHud,
    toast: toast,
    hint: hint,
    showResult: showResult,
    hideResult: hideResult,
    makePoster: makePoster,
    showPoster: showPoster,
    elapsed: elapsed,
    setElapsed: setElapsed,
    startTimer: startTimer,
    stopTimer: stopTimer,
    freeze: freeze,
    resume: resume,
    pickById: handlePick,
    setFast: function (v) { fast = !!v; },
    get fast() { return fast; },
    get state() { return st; },
    elMap: function () { return elMap; }
  };
})(window.G = window.G || {});
