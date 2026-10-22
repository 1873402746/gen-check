# 果了个果 · 水果萌宠三消

一个「羊了个羊」式的堆叠三消小游戏。纯前端、零构建、零依赖；美术是 AI 生成的果冻质感贴图，全部本地化，不请求任何外部资源。

**在线试玩：<https://1873402746.github.io/gen-check/>**

## 玩法

- 点一张**没被上层压住**的牌，它飞进底部 7 格槽位；
- 槽里凑齐 **3 张同图案**立刻消除；
- 槽位塞满 7 格还没消除 → 本局失败；
- 三个道具：**撤销**（退回上一张）、**移出**（把最没用的 3 张挪到暂存区，点暂存区可放回）、**洗牌**（重排盘面图案，保证仍可解）。第 2 关与无限模式**不给洗牌**，配置里是 0 次时按钮直接隐藏。

关卡：
1. **第 1 关** 36 张 / 2 层 / 5 种图案，热身用；
2. **第 2 关** 177 张 / 7 层 / **12 种图案**（图案全用满），地狱难度，道具只有撤销 1 次 + 移出 1 次；
3. 通关后解锁**无限模式**：从 126 张 / 6 层 / 9 图案起步，每过一关 +9 张，每两关 +1 层、+1 图案，封顶 210 张 / 9 层 / 12 图案。

### 难度到底靠什么

调难度前先用模型量过一遍，结论和直觉相反：

| 旋钮 | 实测效果 |
|---|---|
| **每局随机盘面** | **决定性**。之前用固定 seed，同一关每局牌面完全一样，死两三次就能背下来 —— 这才是「太简单」的真正原因 |
| 图案种类 9 → 12 | 对普通玩家有效（贪心模型胜率 3% → 0%），对强玩家影响小 |
| 层数 6 → 8 / 牌数 126 → 177 | **几乎无效，甚至反向**（牌多 → 每步可选项变多）。177 张 7 层与 174 张 8 层在 30 局里都是 25/30 |
| 砍掉洗牌道具 | 对真人有效：少一次「推倒重来」的救场 |
| `tight`（块内强制轮转） | 12 图案下**没有区别**：实测每局构造解峰值本来就都是 6。保留它是为图案少的关卡服务 |

于是加难没有走「堆牌数」这条路，而是随机盘面 + 图案打满 + 砍洗牌。

**一个绕不过去的上限**：构造法保证每局都有解，所以任何足够强的搜索（`tools/strong-player.cjs` 的集束搜索）都能通关，30 局里 25~29 局成功。真正的难度来自「玩家不是完美搜索器」——只有 1 格容错（峰值 6 / 槽位 7）、盘面不可背、图案 12 种记不住。要再往上加，只能动槽位（7 → 6，零容错），但那基本等于「必输」，所以没有做。

数字见 `tools/final-tune.cjs`（30 局/配置）和 `tools/strong-player.cjs`。改完跑 `node tools/difficulty2.cjs` 就能看到新胜率。

**一个必须记住的坑**：每层牌数之和必须是 3 的倍数。写成 170 这种数，`distribute` 会多算出 1 张，多出来的牌没处放，重放校验直接判溢出 —— 表现是「7 层以上就生成失败」，其实跟层数无关。`tools/gen-diag.cjs` 会把失败精确归到「布局 / 拓扑序 / 回填 / 槽位溢出」哪一步。

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
tools/difficulty.cjs      难度体检（贪心玩家，看绝对胜率）
tools/difficulty2.cjs     极限参数扫描（同时报生成成功率，避免调出「无解局」）
tools/strong-player.cjs   集束搜索玩家：能过 = 人类尚有希望，过不了 = 等于无解
tools/final-tune.cjs      定档对比：同种子序列、30 局，比牌数/层数
tools/gen-diag.cjs        生成失败归因（布局/拓扑序/回填/槽位溢出）
tools/endless-check.cjs   无限模式前 14 关是否合法且可稳定生成
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

# 极限扫描 + 强玩家定标：判断改动是「更难」还是「直接无解」
node tools/difficulty2.cjs
node tools/strong-player.cjs 16 8

# 无限模式各关合法性（牌数必须是 3 的倍数）与生成稳定性
node tools/endless-check.cjs

# 浏览器验收（puppeteer-core + 本机 Chrome）：五档视口无溢出、真实点击、E2E 通关/判负、存档持久化、截图
NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules \
  node tools/verify.cjs
```

截图输出在 `tools/shots/`。

页面里保留了 `G.debug` 钩子（`startLevel` / `playSolution` / `fillSlotToLose` / `simulate` 等），方便线上排查与回归，体积可忽略。
