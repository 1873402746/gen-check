/* tools/verify.cjs —— 浏览器端自动化验收（puppeteer-core + 本机 Chrome）
 * 用法：
 *   NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules \
 *   node tools/verify.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

let fails = 0;
const log = (...a) => console.log(...a);
function ok(cond, label, extra) {
  if (cond) log('  ✔ ' + label);
  else { fails++; log('  ✘ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        resp.writeHead(404); return resp.end('not found');
      }
      resp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { srv, port } = await serve();
  const BASE = 'http://127.0.0.1:' + port;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio']
  });

  const errors = [];
  const requests = new Set();

  async function newPage(w, h) {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('request', (r) => requests.add(r.url()));
    if (w) await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500 });
    return page;
  }

  /* ---------- 1. 首页 ---------- */
  log('\n[1] 首页');
  const home = await newPage(375, 667);
  await home.goto(BASE + '/index.html', { waitUntil: 'load' });
  await home.waitForFunction('window.G && window.G.UI && window.G.debug', { timeout: 15000 });
  ok(await home.evaluate(() => document.querySelectorAll('#levelList .lv').length) === 3, '关卡卡片 3 个');
  ok(await home.evaluate(() => document.querySelector('#screen-home').classList.contains('active')), '首屏是首页');
  await home.screenshot({ path: path.join(SHOTS, 'home-375x667.png') });
  await home.close();

  /* ---------- 2. 多视口 ---------- */
  log('\n[2] 多视口布局（第 2 关）');
  const VIEWS = [[360, 640], [375, 667], [414, 896], [768, 1024], [1440, 900]];
  for (const [w, h] of VIEWS) {
    const page = await newPage(w, h);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });
    await page.evaluate(() => G.debug.startLevel('l2'));
    await new Promise((r) => setTimeout(r, 320));
    const exp = await page.evaluate(() => G.totalOf(G.LEVELS.l2));
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const slot = document.querySelector('#slot').getBoundingClientRect();
      const props = document.querySelector('#props').getBoundingClientRect();
      const tiles = document.querySelectorAll('#board .tile');
      const first = tiles[0] ? tiles[0].getBoundingClientRect() : null;
      return {
        scrollW: de.scrollWidth, clientW: de.clientWidth,
        scrollH: de.scrollHeight, innerH: window.innerHeight,
        slotBottom: slot.bottom, slotTop: slot.top, propsBottom: props.bottom,
        tileCount: tiles.length,
        tileW: first ? Math.round(first.width) : 0,
        scale: getComputedStyle(document.querySelector('#board')).transform
      };
    });
    ok(m.scrollW <= m.clientW, w + 'x' + h + ' 无横向溢出', m.scrollW + '>' + m.clientW);
    ok(m.scrollH <= m.innerH + 1, w + 'x' + h + ' 无纵向溢出', m.scrollH + '>' + m.innerH);
    ok(m.slotBottom <= m.innerH + 1, w + 'x' + h + ' 槽位在视口内', m.slotBottom.toFixed(1));
    ok(m.slotTop > m.propsBottom - 1, w + 'x' + h + ' 槽位不与道具重叠', m.slotTop.toFixed(1) + '/' + m.propsBottom.toFixed(1));
    ok(m.tileCount === exp, w + 'x' + h + ' 渲染 ' + exp + ' 张牌', m.tileCount);
    if (w < 500) ok(m.tileW >= 40, w + 'x' + h + ' 牌面宽度 ≥ 40px', m.tileW);
    await page.screenshot({ path: path.join(SHOTS, 'game-l2-' + w + 'x' + h + '.png') });
    await page.close();
  }

  /* ---------- 3. 真实点击 ---------- */
  log('\n[3] 真实点击链路');
  {
    const page = await newPage(375, 667);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });
    await page.evaluate(() => G.debug.startLevel('l1'));
    await new Promise((r) => setTimeout(r, 320));

    /* 找一张可点的牌（未被压住），真实鼠标点击 */
    const pt = await page.evaluate(() => {
      const st = G.debug.state();
      const t = st.tiles.filter((x) => x.state === 'board' && x.blockers === 0)[0];
      const el = document.querySelector('#board .tile[data-id="' + t.id + '"]');
      const r = el.getBoundingClientRect();
      return { id: t.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 420));
    const after = await page.evaluate((id) => ({
      slot: G.debug.state().slot.length,
      inCell: document.querySelectorAll('#slot .tile').length,
      stillInBoard: !!document.querySelector('#board .tile[data-id="' + id + '"]')
    }), pt.id);
    ok(after.slot === 1, '真实点击后入槽 1 张', after.slot);
    ok(after.inCell === 1, 'DOM 中槽位出现 1 张牌', after.inCell);
    ok(after.stillInBoard === false, '棋盘上已移除该牌');

    /* 连点同一张（已不在棋盘）不应再加 */
    await page.mouse.click(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 200));
    ok(await page.evaluate(() => G.debug.state().slot.length) === 1, '同一位置连点只生效一次');

    /* 点被压住的牌：找一个「能真正点到它」的点，点了应该无效 */
    const blocked = await page.evaluate(() => {
      const st = G.debug.state();
      const cands = st.tiles.filter((x) => x.state === 'board' && x.blockers > 0);
      for (const t of cands) {
        const el = document.querySelector('#board .tile[data-id="' + t.id + '"]');
        if (!el) continue;
        const r = el.getBoundingClientRect();
        for (let i = 1; i <= 4; i++) {
          for (let j = 1; j <= 4; j++) {
            const x = r.left + (r.width * i) / 5;
            const y = r.top + (r.height * j) / 5;
            if (document.elementFromPoint(x, y) === el) return { id: t.id, x: x, y: y };
          }
        }
      }
      return null;
    });
    if (blocked) {
      const before = await page.evaluate(() => G.debug.state().slot.length);
      await page.mouse.click(blocked.x, blocked.y);
      await new Promise((r) => setTimeout(r, 250));
      ok(await page.evaluate(() => G.debug.state().slot.length) === before, '点被压住的牌无效（槽位不变）');
      ok(await page.evaluate((id) => G.debug.state().tiles[id].state, blocked.id) === 'board', '被压住的牌仍在棋盘上');
    } else {
      ok(true, '点被压住的牌无效（该局被压牌均被完全遮挡，跳过）');
    }
    await page.screenshot({ path: path.join(SHOTS, 'play-375x667.png') });
    await page.close();
  }

  /* ---------- 4. E2E 通关 / 判负 / 持久化 ---------- */
  log('\n[4] 端到端');
  {
    const page = await newPage(375, 667);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });

    await page.evaluate(() => G.debug.startLevel('l2'));
    const won = await page.evaluate(() => G.debug.playSolution());
    ok(won === true, '按构造解走完第 2 关 → 通关');
    ok(await page.evaluate(() => G.debug.state().status) === 'won', '状态为 won');
    await new Promise((r) => setTimeout(r, 700));
    ok(await page.evaluate(() => G.debug.overlayShown('overlay')), '通关弹层出现');
    await page.screenshot({ path: path.join(SHOTS, 'result-win-375x667.png') });

    /* 海报：真实点按钮 → 生成 PNG */
    await page.evaluate(() => document.querySelector('#btnPoster').click());
    await page.waitForFunction(() => {
      const i = document.querySelector('#posterImg');
      return i && i.src.indexOf('data:image/png') === 0;
    }, { timeout: 12000 }).catch(() => {});
    const poster = await page.evaluate(() => {
      const i = document.querySelector('#posterImg');
      return {
        ok: !!i && i.src.indexOf('data:image/png') === 0,
        len: i ? i.src.length : 0,
        w: i ? i.naturalWidth : 0,
        h: i ? i.naturalHeight : 0,
        shown: document.querySelector('#posterOverlay').classList.contains('show')
      };
    });
    ok(poster.ok && poster.len > 20000, '成绩海报生成成功', poster.len);
    ok(poster.w === 750 && poster.h === 1334, '海报尺寸 750×1334', poster.w + '×' + poster.h);
    ok(poster.shown === true, '海报层已展示');
    await page.screenshot({ path: path.join(SHOTS, 'poster-375x667.png') });
    await page.evaluate(() => document.querySelector('#btnClosePoster').click());

    /* 满槽判负 */
    await page.evaluate(() => { G.UI.hideResult(); G.debug.startLevel('l1'); });
    const lose = await page.evaluate(() => G.debug.fillSlotToLose());
    ok(lose.status === 'lost' && lose.slot === 7, '槽满 7 格判定失败', JSON.stringify(lose));
    await new Promise((r) => setTimeout(r, 700));
    ok(await page.evaluate(() => G.debug.overlayShown('overlay')), '失败弹层出现');
    await page.screenshot({ path: path.join(SHOTS, 'result-lose-375x667.png') });

    /* 存档持久化：通关第 1 关 → 刷新 → 第 2 关解锁 */
    await page.evaluate(() => { G.UI.hideResult(); G.debug.startLevel('l1'); });
    const won1 = await page.evaluate(() => G.debug.playSolution());
    await new Promise((r) => setTimeout(r, 700));
    const savedUnlocked = await page.evaluate(() => G.debug.save().unlocked);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });
    const afterReload = await page.evaluate(() => ({
      unlocked: G.debug.save().unlocked,
      l1: G.debug.save().best.l1,
      lockedCard: document.querySelector('.lv[data-level="l2"]').classList.contains('locked')
    }));
    ok(won1 === true, '第 1 关可通关');
    ok(savedUnlocked >= 2, '通关后 unlocked ≥ 2', savedUnlocked);
    ok(afterReload.unlocked >= 2, '刷新后解锁状态保留', afterReload.unlocked);
    ok(afterReload.l1 != null, '刷新后第 1 关最佳成绩保留', afterReload.l1);
    ok(afterReload.lockedCard === false, '第 2 关卡片已解锁');
    await page.close();
  }

  /* ---------- 5. 道具交互与 DOM 一致性 ---------- */
  log('\n[5] 道具与 DOM 一致性');
  {
    const page = await newPage(375, 667);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });
    await page.evaluate(() => G.debug.startLevel('l2'));
    await new Promise((r) => setTimeout(r, 300));

    const dom = () => page.evaluate(() => {
      const st = G.debug.state();
      const expect = { board: 0, slot: 0, stage: 0, gone: 0 };
      st.tiles.forEach((t) => expect[t.state]++);
      return {
        expect: expect,
        board: document.querySelectorAll('#board .tile').length,
        slot: document.querySelectorAll('#slot .tile').length,
        tray: document.querySelectorAll('#tray .tile').length,
        all: document.querySelectorAll('.tile').length
      };
    });
    const consistent = (m, label) => ok(
      m.board === m.expect.board && m.slot === m.expect.slot && m.tray === m.expect.stage &&
      m.all === m.expect.board + m.expect.slot + m.expect.stage,
      label, JSON.stringify(m)
    );

    /* 拿 4 张不同图案的牌入槽（避免凑成三消） */
    await page.evaluate(() => {
      const st = G.debug.state();
      let n = 0;
      for (const t of st.tiles) {
        if (n >= 4) break;
        if (t.state !== 'board' || t.blockers !== 0) continue;
        const same = st.slot.filter((id) => st.tiles[id].pat === t.pat).length;
        if (same >= 2) continue;
        G.UI.pickById(t.id);
        n++;
      }
    });
    await new Promise((r) => setTimeout(r, 600));
    consistent(await dom(), '入槽 4 张后 DOM 与状态一致');

    /* 移出 */
    const slotBeforeMove = await page.evaluate(() => G.debug.state().slot.length);
    await page.evaluate(() => document.querySelector('.prop[data-prop="move"]').click());
    await new Promise((r) => setTimeout(r, 400));
    let m = await dom();
    consistent(m, '移出后 DOM 与状态一致');
    const expStage = Math.min(3, slotBeforeMove);
    ok(m.tray === expStage && m.slot === slotBeforeMove - expStage,
      '移出 ' + expStage + ' 张：槽 ' + (slotBeforeMove - expStage) + ' 张 + 暂存 ' + expStage + ' 张',
      m.slot + '/' + m.tray);
    await page.screenshot({ path: path.join(SHOTS, 'props-move-375x667.png') });

    /* 点暂存牌放回 */
    await page.evaluate(() => {
      const el = document.querySelector('#tray .tile');
      if (el) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 350));
    consistent(await dom(), '暂存放回后 DOM 与状态一致');

    /* 第 2 关按配置不给洗牌 → 按钮应隐藏（不是显示成灰的「0 次」） */
    const shuffleHidden = await page.evaluate(() => {
      const b = document.querySelector('.prop[data-prop="shuffle"]');
      return !b || getComputedStyle(b).display === 'none';
    });
    ok(shuffleHidden, '第 2 关未配置洗牌 → 洗牌按钮隐藏');
    ok(await page.evaluate(() => G.LEVELS.l2.props.shuffle === 0), '第 2 关洗牌次数确实为 0');

    /* 撤销：先点一张「不会凑成三消」的牌 */
    await page.evaluate(() => {
      const st = G.debug.state();
      const cnt = {};
      st.slot.forEach((id) => { cnt[st.tiles[id].pat] = (cnt[st.tiles[id].pat] || 0) + 1; });
      const t = st.tiles.find((x) => x.state === 'board' && x.blockers === 0 && (cnt[x.pat] || 0) < 2);
      if (t) G.UI.pickById(t.id);
    });
    await new Promise((r) => setTimeout(r, 400));
    const slotBeforeUndo = await page.evaluate(() => G.debug.state().slot.length);
    ok(await page.evaluate(() => G.debug.state().undoOk) === true, '刚点完的牌可以撤销');
    await page.evaluate(() => document.querySelector('.prop[data-prop="undo"]').click());
    await new Promise((r) => setTimeout(r, 400));
    m = await dom();
    consistent(m, '撤销后 DOM 与状态一致');
    ok(m.slot === slotBeforeUndo - 1, '撤销使槽位减少 1 张', m.slot + ' ← ' + slotBeforeUndo);
    await page.screenshot({ path: path.join(SHOTS, 'props-undo-375x667.png') });
    await page.close();
  }

  /* ---------- 5b. 洗牌（第 1 关仍有洗牌，第 2 关已按配置取消） ---------- */
  log('\n[5b] 洗牌与可解性');
  {
    const page = await newPage(375, 667);
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction('window.G && window.G.debug', { timeout: 15000 });
    await page.evaluate(() => G.debug.startLevel('l1', null, 0x51ed270b));
    await new Promise((r) => setTimeout(r, 300));
    const before = await page.evaluate(() => G.debug.state().tiles.map((t) => t.pat).join(','));
    await page.evaluate(() => document.querySelector('.prop[data-prop="shuffle"]').click());
    await new Promise((r) => setTimeout(r, 400));
    const after = await page.evaluate(() => G.debug.state().tiles.map((t) => t.pat).join(','));
    const changed = before !== after;
    ok(changed, '洗牌后图案分配确实变化');
    /* 洗牌必须保证仍有解：按洗牌后重算的清空序走完 */
    const won = await page.evaluate(() => G.debug.playSolution());
    ok(won === true, '洗牌后仍能按合法清空序通关');
    await page.screenshot({ path: path.join(SHOTS, 'props-shuffle-375x667.png') });
    await page.close();
  }

  /* ---------- 6. 资源与报错 ---------- */
  log('\n[6] 资源与报错');
  const ext = [...requests].filter((u) => !u.startsWith(BASE) && !u.startsWith('data:'));
  ok(ext.length === 0, '无外部资源请求', ext.slice(0, 3).join(' | '));
  ok(errors.length === 0, '无 JS 报错', errors.slice(0, 3).join(' | '));

  await browser.close();
  srv.close();

  log('\n' + (fails === 0 ? 'ALL PASS ✔' : fails + ' 项失败 ✘'));
  log('截图目录：' + SHOTS);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n验收脚本异常：', e);
  process.exit(1);
});
