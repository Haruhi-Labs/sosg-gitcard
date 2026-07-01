# sosg-gitcard

> **SOS団 団員ファイル** — 把 GitHub 域名改成 **harufan**，查看你在 SOS団 中的身份。

一个《凉宫春日》粉丝趣味项目：输入 GitHub 用户名，根据其公开数据把 ta 认定为最接近的
SOS団 团员（团长型 / 情报统合型 / 未来人型 / 协调者型 / 常识人型），并签发一张
SOS団 官方档案卡——五维能力雷达、数据读出、**协力实绩（社区贡献）**、代表作、全员契合度。

![sosg-gitcard · SOS団 団員ファイル](docs/preview.png)

## 特点

- **零服务器负载**：纯静态站点，GitHub 数据全部在浏览器端直连 `api.github.com` 获取，
  服务器只负责发静态文件。
- **属性诊断**：由五维能力值（行動 / 影響 / 協調 / 熱量 / 継続）加权判定团员，纯确定性，
  同一用户结果稳定。诊断算法见 `src/members.ts`。
- **协作/贡献导向**：協調力不再只看「关注/fork」，而是三路并列统计对他人项目的真实贡献
  ——发起的 PR 总数、被合并进「他人」仓库的 PR 数（**Search API**）、以及**直接 push 进
  他人仓库**的近期推送次数（**Events API**，捕捉有写权限、不走 PR 的维护者）。这样「自己
  项目不多、却活跃投入开源社区」的开发者也能被正确识别为协调者型。
- **熱量维度**：第五维原为「探索 / 语言广度」，因 GitHub 每仓库只标一个主语言、语言统计
  难以准确，已改为**熱量**——取近一年贡献总量（同热力图数据），衡量当下的活跃与勤勉。
- **贡献热力图（绿瓷砖）**：近一年贡献日历，染成团员属性色作为「活動記録」。github.com
  的贡献 HTML 浏览器跨域取不到，由同源的 Cloudflare Pages Function 在边缘代理（缓存 30 分钟）。
- **限流友好**：每份档案发 3 个核心请求（用户 + 仓库 + events，额度 60 次/小时）+ 2 个
  搜索请求（PR 贡献统计，额度独立，约 10 次/分钟）+ 1 次同源贡献代理（不占核心额度）。
  结果在 `localStorage` 缓存 30 分钟；核心接口限流时回退缓存，各辅助接口失败时档案照常
  展示、对应字段留空。
- **视觉**：山寨官方认定档案 · 方格纸课桌 · 红色臂章 · 认定印盖章动画。
  字体 Anton / Zen Kaku Gothic New / Space Mono。尊重 `prefers-reduced-motion`。

## 本地运行

```bash
npm install
npm run dev      # http://localhost:5173
```

访问方式：

- `http://localhost:5173/torvalds` —— 路径即用户名
- `http://localhost:5173/?u=torvalds` —— 或用查询参数
- `http://localhost:5173/` —— 落地页，手动输入检索

## 部署

**线上地址：<https://harufan.com>（`harufan.com/用户名` 直达档案）**

部署在 **Cloudflare Pages**：静态站 + 同源的 **Pages Functions**（`functions/api/contributions.ts`）。
后者是贡献日历（绿瓷砖）的代理——github.com 的贡献 HTML 浏览器跨域取不到，由这个边缘
函数在服务端抓取解析成 JSON、边缘缓存 30 分钟返回，客户端只请求同源的 `/api/contributions`。

```bash
npm run build    # 产物在 dist/，含类型检查
npm run preview  # 本地预览生产构建
npm run deploy   # 构建并部署到 Cloudflare Pages（需 CLOUDFLARE_API_TOKEN / _ACCOUNT_ID）
```

`wrangler.toml` 配置项目名与产物目录；`functions/` 目录会被自动编译为 Pages Functions。
本地开发时，`vite.config.ts` 里的中间件复刻了同一个 `/api/contributions`，故 `npm run dev`
也能端到端拿到热力图。

这是一个 **SPA**：所有路径回落 `index.html`（已内置 `public/_redirects`），以支持 `/用户名` 直达。

## 目录

```
src/
├── main.ts      入口：URL → 拉数据 → 渲染，客户端路由
├── github.ts    GitHub API 客户端 + localStorage 缓存 + 限流降级
├── metrics.ts   原始数据 → 五维能力值
├── members.ts   SOS団 团员定义 + 属性诊断算法
├── contrib.ts   贡献日历解析器（Function 与 Vite 中间件共用）
├── radar.ts     五维能力雷达图（纯 SVG）
├── heatmap.ts   贡献热力图 / 绿瓷砖（纯 SVG，染团员属性色）
├── render.ts    所有视图渲染
├── style.css    视觉样式
└── types.ts     类型定义
functions/
└── api/contributions.ts   Cloudflare Pages Function：同源贡献代理
scripts/
└── diagnose-check.ts      用真实账号验证诊断区分度的脚本
```

## 免责

数据取自 GitHub 公开接口，团员判定纯属娱乐算法，与本人实际无关。粉丝二次创作，
角色版权归谷川流 / 角川所有。世界を大いに盛り上げるための涼宮ハルヒの団。
