/* geometry.js —— 整数栅格几何与遮挡图 */
(function (G) {
  'use strict';
  var U = G.C.UNIT;

  /* 两张牌的重叠面积（单位：unit²）。牌占 2x2 units，区间左闭右开 */
  function overlapArea(a, b) {
    var w = Math.min(a.ux + U, b.ux + U) - Math.max(a.ux, b.ux);
    var h = Math.min(a.uy + U, b.uy + U) - Math.max(a.uy, b.uy);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  /* 建立遮挡图：t.blocks = 被 t 压住的牌 id 列表；目标牌 blockers = 压住它的张数 */
  function buildOcclusion(tiles) {
    var i, j;
    for (i = 0; i < tiles.length; i++) {
      tiles[i].blocks = [];
      tiles[i].blockers = 0;
    }
    for (i = 0; i < tiles.length; i++) {
      for (j = i + 1; j < tiles.length; j++) {
        var a = tiles[i], b = tiles[j];
        if (a.layer === b.layer) continue;
        if (overlapArea(a, b) <= 0) continue;
        var hi = a.layer > b.layer ? a : b;
        var lo = a.layer > b.layer ? b : a;
        hi.blocks.push(lo.id);
        lo.blockers++;
      }
    }
    return tiles;
  }

  /* 单张判定（供测试与调试用，运行时不再全量重算） */
  function isCovered(t, tiles) {
    for (var i = 0; i < tiles.length; i++) {
      var o = tiles[i];
      if (o.id === t.id) continue;
      if (o.state !== 'board') continue;
      if (o.layer <= t.layer) continue;
      if (overlapArea(t, o) > 0) return true;
    }
    return false;
  }

  /* 把所有牌整体平移，使最小坐标为 0，并返回棋盘尺寸（units） */
  function normalize(tiles) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, t;
    for (i = 0; i < tiles.length; i++) {
      t = tiles[i];
      if (t.ux < minX) minX = t.ux;
      if (t.uy < minY) minY = t.uy;
      if (t.ux + U > maxX) maxX = t.ux + U;
      if (t.uy + U > maxY) maxY = t.uy + U;
    }
    for (i = 0; i < tiles.length; i++) {
      tiles[i].ux -= minX;
      tiles[i].uy -= minY;
    }
    return { w: maxX - minX, h: maxY - minY };
  }

  G.geom = {
    overlapArea: overlapArea,
    buildOcclusion: buildOcclusion,
    isCovered: isCovered,
    normalize: normalize
  };
})(window.G = window.G || {});
