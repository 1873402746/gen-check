# 果了个果 · 水果萌宠三消

一个「羊了个羊」式的堆叠三消小游戏。纯前端、零构建、零依赖；美术是 AI 生成的果冻质感贴图，全部本地化，不请求任何外部资源。

**在线试玩：<https://1873402746.github.io/gen-check/>**

## 玩法

- 点一张**没被上层压住**的牌，它飞进底部 7 格槽位；
- 槽里凑齐 **3 张同图案**立刻消除；
- 槽位塞满 7 格还没消除 → 本局失败；
- 三个道具：**撤销**（退回上一张）、**移出**（把最没用的 3 张挪到暂存区，点暂存区可放回）、**洗牌**（重排盘面图案，保证仍可解）。

关卡：
1. **第 1 关** 36 张 / 2 层 / 5 种图案，热身用；
2. **第 2 关** 126 张 / 6 层 / **11 种图案**，地狱难度；
3. 通关后解锁**无限模式**，每过一关加一层、加牌、加图案。

难度旋钮是 `patterns`（图案种类），不是层数 —— 实测把 L2 的图案从 9 种加到 11 种，细心玩家胜率从 ~10% 掉到 ~4%；而再加一层（7 层 144 张）会直接让构造校验过不了、频繁回退。改 `js/config.js` 一行就能调，`node tools/difficulty.cjs` 可以量出对应胜率。

## 本地运行

双击 `index.html` 即可（全程无 `fetch`、无 ES Module，`file://` 下不会被 CORS 拦）。

想用 http 方式跑：

```bash
python -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080
```

## 部署到 GitHub Pages

已部署完成，仓库 <https://github.com/1873402746/gen-check>，Pages 走 `main` 分支根目录自动构建：

<https://1873402746.github.io/gen-check/>

换到自己的仓库时，重复这三步即可：

1. 把整个目录推到仓库的 `main` 分支（根目录）；
2. 仓库 `Settings → Pages → Build and deployment`，Source 选 **Deploy from a branch**，分支选 `main`，目录选 **/(root)**；
3. 等一两分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

`.nojekyll` 已放好，避免 Pages 走 Jekyll 处理静态文件。

## 代码结构

```
index.html                唯一页面
css/style.css             全部样式与动画
assets/pat/*.png          12 张牌面贴图（160px 透明 PNG，共 355KB）
js/util.js                确定性随机数 / localStorage 安全封装 / 小工具
js/config.js              常量、关卡表、图案表
js/geometry.js            整数栅格重叠判定与遮挡图
js/generator.js           布局生成 + 拓扑清空序 + 图案回填 + 洗牌重建
js/game.js                状态机（点击 / 三消 / 道具 / 无头模拟）
js/audio.js               WebAudio 合成音效
js/ui.js                  DOM 渲染、飞牌动画、HUD、结算、海报
js/main.js                关卡流程、按钮绑定、G.debug 调试钩子
js/icons-data.js          海报用的 base64 图标（331KB，只在点「生成海报」时按需加载）
tools/gen-check.cjs       算法与状态机体检
tools/difficulty.cjs      难度体检（多组参数下的胜率）
tools/verify.cjs          puppeteer 浏览器端到端验收
tools/iconize.py          AI 原图 → 抠图 → 统一尺寸的流水线
tools/mkicondata.py       牌面 PNG → js/icons-data.js
```

## 牌面美术是怎么来的

1. `ImageGen` 生成 12 张 1024×1024 的果冻质感图标，**提示词模板固定**（同样的描边、高光、视角描述），保证 12 张风格统一；
2. 生成结果实际是浅灰白底、没有 alpha 通道，所以 `tools/iconize.py` 自己做抠图：取四边中位数当背景色，用「颜色相似 + 从边界连通传播」判定背景（不是全局阈值，否则羊的白毛、白菜的白帮会被抠成洞），边缘再内缩 1px 吃掉过渡白边、高斯羽化 0.65px；
3. 按 bounding box 裁切，缩放到 160×160、主体最长边占 92%，12 张视觉大小一致；
4. `tools/mkicondata.py` 额外生成 128px 的 base64 版本给海报用 —— `file://` 下 canvas `drawImage` 本地图片会污染画布，`toDataURL` 直接抛 SecurityError，内联成 data URI 才没有这个限制。

想换美术：把新图丢进 `assets/raw/`（按文件名顺序对应 12 个图案），依次跑 `python tools/iconize.py` 和 `python tools/mkicondata.py` 即可。

## 一局是怎么保证「有解」的

不是「随机撒图案再拿去求解」，而是**反向构造**：

1. 从当前所有可点的牌里随机取一张、取走后解锁它压住的牌，得到一条合法的清空顺序（拓扑序）；
2. 沿这条顺序回填图案，每 **B 个图案**分成一块（B=3），块内 3 种图案各 3 张。块内任意排列下，槽位占用上界都是 `2B = 6 < 7`，所以这条顺序在真实规则下一定走得通；
3. 生成后还会**按真实规则重放一遍**这条顺序做校验，不通过就换随机种子重来；
4. 洗牌同理：它以「当前槽内已有几张」为起点重新构造，所以洗完一定仍有解。

B 是难度旋钮：B=1 时三张同图案挨在一起（送分），B=3 时峰值占用顶到 6（一步走错就满槽）。

## 自检与验收

```bash
# 算法体检（Node，无需浏览器）：800+ 局生成、同层零重叠、重放可解、状态机、道具
node tools/gen-check.cjs 80

# 难度体检：多组参数下「细心/普通/随手」玩家的胜率，调参前先跑这个
node tools/difficulty.cjs

# 浏览器验收（puppeteer-core + 本机 Chrome）：五档视口无溢出、真实点击、E2E 通关/判负、存档持久化、截图
NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules \
  node tools/verify.cjs
```

截图输出在 `tools/shots/`。

页面里保留了 `G.debug` 钩子（`startLevel` / `playSolution` / `fillSlotToLose` / `simulate` 等），方便线上排查与回归，体积可忽略。
