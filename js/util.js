/* util.js —— RNG / 存储 / 小工具 */
(function (G) {
  'use strict';

  /* mulberry32：确定性伪随机，同一 seed 必然同一结果 */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffleArr(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pickWeighted(list, rng) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].w;
    if (total <= 0) return list[Math.floor(rng() * list.length)];
    var r = rng() * total;
    for (i = 0; i < list.length; i++) {
      r -= list[i].w;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function byId(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtTime(ms) {
    if (ms == null) return '--';
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  /* ---- localStorage 安全封装：任何异常都不抛，降级到内存 ---- */
  var KEY = 'guolegeguo.save.v1';
  var memRaw = null;

  function rawGet() {
    try { return window.localStorage.getItem(KEY); }
    catch (e) { return memRaw; }
  }
  function rawSet(v) {
    try { window.localStorage.setItem(KEY, v); }
    catch (e) { memRaw = v; }
  }
  function defSave() {
    return { v: 1, unlocked: 1, best: { l1: null, l2: null, endless: 0 }, muted: false };
  }
  function loadSave() {
    var raw = rawGet();
    var d = defSave();
    if (!raw) return d;
    try {
      var o = JSON.parse(raw);
      if (!o || o.v !== 1) return d;
      if (typeof o.unlocked === 'number') d.unlocked = Math.max(1, Math.min(3, o.unlocked));
      if (o.best && typeof o.best === 'object') {
        d.best.l1 = typeof o.best.l1 === 'number' ? o.best.l1 : null;
        d.best.l2 = typeof o.best.l2 === 'number' ? o.best.l2 : null;
        d.best.endless = typeof o.best.endless === 'number' ? o.best.endless : 0;
      }
      d.muted = !!o.muted;
      return d;
    } catch (e) { return d; }
  }
  function saveSave(o) {
    try { rawSet(JSON.stringify(o)); } catch (e) { /* 忽略 */ }
  }

  /* 深拷贝（用于状态快照对比，纯数据无循环引用） */
  function snap(state) {
    return {
      slot: state.slot.slice(),
      stage: state.stage.slice(),
      pats: state.tiles.map(function (t) { return [t.state, t.pat, t.blockers]; })
    };
  }
  function sameSnap(a, b) {
    if (!a || !b) return false;
    if (a.slot.join() !== b.slot.join()) return false;
    if (a.stage.join() !== b.stage.join()) return false;
    if (a.pats.length !== b.pats.length) return false;
    for (var i = 0; i < a.pats.length; i++) {
      if (a.pats[i][0] !== b.pats[i][0] || a.pats[i][1] !== b.pats[i][1] || a.pats[i][2] !== b.pats[i][2]) return false;
    }
    return true;
  }

  G.util = {
    mulberry32: mulberry32,
    hashStr: hashStr,
    shuffleArr: shuffleArr,
    pickWeighted: pickWeighted,
    byId: byId, qs: qs, qsa: qsa,
    fmtTime: fmtTime,
    loadSave: loadSave, saveSave: saveSave,
    snap: snap, sameSnap: sameSnap
  };
})(window.G = window.G || {});
