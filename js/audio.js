/* audio.js —— WebAudio 合成音效，零音频文件 */
(function (G) {
  'use strict';
  var actx = null, muted = false;

  function ensure() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { actx = null; }
    }
    return actx;
  }

  function tone(opt) {
    var ctx = ensure();
    if (!ctx || muted) return;
    var t0 = ctx.currentTime + (opt.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.f0, t0);
    if (opt.f1 && opt.f1 !== opt.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t0 + opt.dur);
    }
    var vol = opt.vol == null ? 0.16 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + opt.dur + 0.02);
  }

  var audio = {
    get muted() { return muted; },
    setMuted: function (v) { muted = !!v; },
    unlock: function () {
      var ctx = ensure();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    },
    click: function () {
      tone({ f0: 660, f1: 900, dur: 0.07, type: 'triangle', vol: 0.13 });
    },
    pick: function () {
      tone({ f0: 520, f1: 760, dur: 0.09, type: 'sine', vol: 0.12 });
    },
    match: function () {
      tone({ f0: 740, dur: 0.1, type: 'triangle', vol: 0.14 });
      tone({ f0: 988, dur: 0.12, type: 'triangle', vol: 0.13, delay: 0.07 });
      tone({ f0: 1319, dur: 0.16, type: 'sine', vol: 0.1, delay: 0.13 });
    },
    blocked: function () {
      tone({ f0: 190, f1: 120, dur: 0.13, type: 'sawtooth', vol: 0.1 });
    },
    prop: function () {
      tone({ f0: 880, f1: 1220, dur: 0.1, type: 'square', vol: 0.08 });
    },
    fail: function () {
      tone({ f0: 330, f1: 90, dur: 0.42, type: 'sawtooth', vol: 0.16 });
      tone({ f0: 240, f1: 70, dur: 0.5, type: 'sine', vol: 0.12, delay: 0.05 });
    },
    win: function () {
      var seq = [523, 659, 784, 1046, 1319];
      for (var i = 0; i < seq.length; i++) {
        tone({ f0: seq[i], dur: 0.22, type: 'triangle', vol: 0.13, delay: i * 0.09 });
      }
    }
  };

  G.audio = audio;
})(window.G = window.G || {});
