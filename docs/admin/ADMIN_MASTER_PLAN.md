# Firefly Blog Admin 总体规划（ADMIN_MASTER_PLAN）

> 版本：v1.0 ｜ 日期：2026-10-04 ｜ 状态：已定稿（Phase 0 产出）
> 范围：为 liqiming.top（Astro 7 + Firefly 主题）增加一个长期可维护的 Admin / CMS 运营后台
> 原则：**前台零破坏、Markdown 仍是内容真相源、不改变生产部署链本质、后台与前台同一 Design System**

---

## 目录

1. [项目现状审计](#1-项目现状审计)
2. [当前架构图](#2-当前架构图)
3. [GitHub 开源方案调研与选型](#3-github-开源方案调研与选型)
4. [目标架构](#4-目标架构)
5. [后台信息架构（Sidebar）](#5-后台信息架构sidebar)
6. [页面 Sitemap](#6-页面-sitemap)
7. [模块清单](#7-模块清单)
8. [Agent 分工](#8-agent-分工)
9. [Agent 依赖关系](#9-agent-依赖关系)
10. [数据模型](#10-数据模型)
11. [API 规划](#11-api-规划)
12. [Auth / Permission 规划](#12-auth--permission-规划)
13. [Analytics 规划](#13-analytics-规划)
14. [Media 规划](#14-media-规划)
15. [SEO 规划](#15-seo-规划)
16. [Backup 规划](#16-backup-规划)
17. [Publish 规划（发布流水线）](#17-publish-规划发布流水线)
18. [Design System 规划](#18-design-system-规划)
19. [Git 工作流](#19-git-工作流)
20. [测试策略](#20-测试策略)
21. [安全策略](#21-安全策略)
22. [性能策略](#22-性能策略)
23. [分阶段开发计划（概览）](#23-分阶段开发计划概览)
24. [阶段验收标准（概览）](#24-阶段验收标准概览)
25. [风险清单](#25-风险清单)
26. [回滚方案](#26-回滚方案)
27. [未来扩展路线](#27-未来扩展路线)

---

## 1. 项目现状审计

> 审计时间 2026-10-04，基于 main 分支（`add7484`，相对上游 Cuteleaf/Firefly master 领先 1 个自有提交）。
> 注意：工作区存在 11 个未提交变更（音乐/相册/导航配置、3 篇新文章），开发前需先由用户提交或清理。

### 1.1 技术栈与运行形态

| 维度 | 现状 |
|---|---|
| 框架 | Astro **7.3.2**（未设 `output`，默认 **static 纯 SSG**） |
| UI 框架 | Svelte 5.57（runes 为主），Astro 组件为主干 |
| 样式 | Tailwind CSS 4.3（CSS-first，无 config 文件）+ Stylus（仅 2 个变量文件）+ `@tailwindcss/typography` |
| 语言 | TypeScript（`strictNullChecks` 仅此一项，**非完整 strict**；`isolatedDeclarations` 开启） |
| 包管理 | pnpm 11.22 workspace（当前 `packages: ['.']` 单包），Node ≥ 22.23.0 |
| Lint/Format | Biome（tab、双引号） |
| 搜索 | Pagefind（构建期索引，`run-pagefind.ts`） |
| 页面过渡 | swup（`@swup/astro`，容器级替换 + 进度条） |
| 代码块 | expressive-code（one-dark-pro / one-light，随主题切换） |
| SSR | **无**。全库无 `prerender = false`，无 Astro Actions，无 middleware。cloudflare adapter 仅在 `CF_WORKERS` 环境变量下启用（当前生产不使用） |

### 1.2 内容数据层（决定 Admin 内容模块的根基）

**存储方案：Astro Content Collections（Content Layer API）+ 官方 `glob()` loader，全部内容是 Git 仓库里的 Markdown 文件。无数据库。**

`src/content.config.ts` 定义 4 个 collection：

| Collection | 路径 | Pattern | 当前数量 |
|---|---|---|---|
| `posts` | `src/content/posts/` | `**/*.{md,mdx}` | 9 篇（全 `.md`，扁平目录） |
| `dynamic` | `src/content/dynamic/` | `**/*.md` | 4 条（文件名即时间戳 `YYYY-MM-DD-HHMMSS.md`） |
| `spec` | `src/content/spec/` | `**/*.{md,mdx}` | 3 个（about.md / friends.mdx / guestbook.md） |
| `projects` | `src/content/projects/` | `**/*.{md,mdx}` | 1 篇 |

**posts frontmatter schema（完整，Admin 表单/编辑器的唯一依据）**：

```ts
title:        string                  // 必填
published:    date                    // 必填（YYYY-MM-DD）
updated:      date?                   // 可选
draft:        boolean  = false
description:  string   = ""
image:        string   = ""           // 空=无封面；"api"=随机封面（coverImageConfig）
tags:         string[] = []
category:     string   = ""           // ⚠️ 单字符串，非数组；空值前台归入「未分类」
lang:         string   = ""
pinned:       boolean  = false
author:       string   = ""           // 空=回退 profileConfig.name（单作者体系）
sourceLink:   string   = ""
licenseName:  string   = ""           // 空=回退 licenseConfig（CC BY-NC-SA 4.0）
licenseUrl:   string   = ""
comment:      boolean  = true
password:     string   = ""           // ⚠️ 非空=客户端 AES-256-GCM 加密文章
passwordHint: string   = ""
series:       string   = ""
seriesOrder:  number?                 // 无默认
// 内部注入（非用户填写）：prevTitle/prevSlug/nextTitle/nextSlug
```

**⚠️ 审计关键发现（Admin 必须遵守）**：
1. **`slug` 字段是"幽灵字段"**——所有 9 篇文章 frontmatter 都写了 `slug:`，但 schema 无此字段，Zod 静默丢弃；**真实 URL 由文件名决定**（`agents-api.md` → `/posts/agents-api/`，见 `src/utils/url-utils.ts`）。Admin 改 URL = 重命名文件，且**不得清理既有文章的 `slug:` 字段**（保持文件 diff 最小，除非用户显式要求）。
2. `category` 是单值字符串，**无嵌套分类**；分类/标签无独立数据文件，全部从 frontmatter 聚合（`src/utils/content-utils.ts`）。
3. `password` 非空的文章是构建期加密文章（`src/utils/crypto-utils.ts` + `EncryptedPost.astro`）。Admin 编辑这类文章时**必须整文重加密**，且密码字段不明文回显到任何列表接口。
4. 分类/标签的"页面"实际是 `/archive/?category=xxx` 查询参数过滤（`ArchivePanel.astro` 客户端过滤），不存在独立分类页路由。
5. `new-post.js` 脚手架用 pinyin-pro 把中文文件名转拼音 slug——Admin 新建文章需复用同一规则保持一致。
6. 构建时 `src/pages/api/allPostMeta.json.ts` 与 `dynamic.json.ts` 生成**静态 JSON**（唯一"API"，只读）。

### 1.3 配置体系（Admin 设置模块的映射对象）

`src/config/` 共 27 个 TS 文件 + barrel `index.ts`，与 `src/types/` 一一对应。要点：

- `siteConfig.ts`：站点标题/URL/描述/keywords、`themeColor.hue=228`、`pages.*` 11 个页面开关（friends/guestbook/dynamic/projects/gallery/booknav/sponsor=true；bilibili/bangumi/vndb/mal=false）、navbar 外观、分页、文章列表布局、OG 图生成（`generateOgImages: true`）等。
- `navBarConfig.ts`：导航结构 `links: NavBarLink[]`（name/url/icon/external/children/pageKey），由预设池组装，5 组下拉。
- `profileConfig.ts`：头像/名字/bio/社交链接（4 条）。
- `commentConfig.ts`：**当前启用 artalk**，server=`https://liqiming.top/artalk`（自托管，OpenResty 反代 127.0.0.1:23366，数据在服务器 `/opt/artalk/artalk.db` SQLite）；组件层支持 twikoo/waline/giscus/disqus。
- `analyticsConfig.ts`：GA/Clarity/**Umami**/51la 四个统计位，**ID 全空 = 未启用**，但 `src/components/analytics/UmamiAnalytics.astro` 等组件已就绪并已在 `Layout.astro` 条件渲染。**这是 Analytics 方案的重大既有资产**。
- `friendsConfig.ts`：`FriendLink[]` 结构已定义但**当前为空数组**；`booknavConfig.ts`：5 组书签数据内联在 TS。
- 已有 3 套 `PUBLIC_*` 环境变量覆盖机制（页面开关/语言/显示设置），模式成熟可复用。
- `FooterConfig.html`：页脚自由 HTML（当前含 ICP 备案号）。

### 1.4 主题与 Design System（Admin 视觉复用的直接依据）

- **Token 总源 = `src/styles/variables.styl`**：亮/暗两套 `:root` / `:root.dark` 变量，**全部彩色 token 是 `oklch(L C var(--hue))` 单色相驱动**（改一个 `--hue` 整站换色，默认 228）。
- 语义色：`--primary`、`--page-bg`、`--card-bg`、`--btn-regular-bg/hover/active`、`--btn-content`、`--float-panel-bg`、`--line-divider`、`--muted`、`--selection-bg`、admonitions 五色等。
- 圆角：`--radius-large: 1rem`（卡片主圆角）、`--radius-sm…3xl: 4~24px`、`--radius-full`；间距 `--spacing-xs…5xl: 4~48px`；阴影/缓动/时长/z-index/断点全套齐备。
- **组件原语**（`main.css @layer components`）：`card-base`、`float-panel`、`btn-card / btn-plain / btn-regular`、`expand-animation` 波纹、`text-90/75/50/30/25` 透明度文字、`dropdown-*`。
- **签名视觉**：卡片 1rem 大圆角 + 默认无阴影（描边模式才 `shadow-xs`）；标题左侧 `before:bg-(--primary)` 竖条；`transition-colors duration-150`；`focus-visible` 主色描边；暗色 = `html.dark` class + localStorage 持久化 + View Transitions 切换动画。
- 字体：正文系统栈（`@theme --font-sans`），代码 JetBrains Mono（`--font-code`），banner 区 Zen Maru Gothic / Inter；构建后有子集化脚本。
- 图标：astro-icon（Astro 组件内，主力 **material-symbols** + fa7）与 `common/Icon.svelte`（Svelte island 内，@iconify/svelte/offline + 本地 icons-data.json）双轨。
- i18n：构建期静态翻译，6 语种，当前 zh_CN。

### 1.5 部署与构建（Publish 模块的约束条件）

- **生产环境：腾讯云 Lighthouse + OpenResty 静态文件服务器托管 `dist/`**（`docs/deploy.md` 明确），域名 `liqiming.top`，HTTPS。
- 服务器上已有自托管先例：**Artalk 评论后端**（`/opt/artalk`，OpenResty 反代 `/artalk/`）和 **mascot-chat AI 代理**（Python 服务 + Key 服务器端保存 + Origin 校验）——证明服务器可运行长驻服务，且有"密钥不进前端"的安全意识文档。
- `.github/workflows/`：`build.yml`（push/PR → check + type-check + build）、`biome.yml`、`deploy.yml`（GitHub Pages，**仅手动触发，实际不用**）。vercel.json / wrangler.jsonc 备而不用。
- **构建链 8 步**（必须完整执行，只跑 `astro build` 会坏搜索/多传资源）：
  `generate-github-card-data → generate-lqips → generate-vndb-covers → astro build → prune-pio-assets → subset-fonts → minify-inline-scripts → run-pagefind`
- 现有发布方式：本地 `pnpm build` → SSH/rsync 上传 dist（人工操作）。

### 1.6 安全与认证现状

- **零认证**：无 middleware、无 session/cookie、无用户表。唯一"密码"是构建期客户端文章加密（AES-256-GCM）。
- 无 `.env` 落地；`.gitignore` 已排除 `.env*`、`*.pem/*.key`、`docs/private/`。
- 前台输出安全：rehype-email-protection、外链处理、sanitize-html 依赖存在。
- **结论：Admin 认证体系从零建设，无历史包袱。**

### 1.7 统计与评论现状

- 统计：四个组件就绪、全部空 ID；前台唯一计数是 Artalk `visitorCount: true`（文章页浏览数）。无 busuanzi。
- 评论：Artalk 自托管（含其自带后台），前端 UI 自托管于 `public/artalk-ui/`。**Artalk 提供 Open API（token 鉴权），Admin 可代理聚合**。

### 1.8 测试与工程质量

- **零测试**（无 vitest/playwright 等任何测试设施）；质量门 = CI 三件套：`astro check` + `tsc --noEmit --isolatedDeclarations` + Biome + 完整构建。
- 代码库干净：全库仅 2 处 TODO；疑似死代码仅 `src/components/pages/dynamic/DynamicItem.astro`（无引用）。
- AGENTS.md / CLAUDE.md / CONTRIBUTING.md 三层协作规范已存在：Conventional Commits、禁止提交密钥、UI 改动附截图、提交前三件套。

### 1.9 审计结论（输入到架构决策）

1. 内容体量小（9 篇文章 + 4 条动态），**Markdown 迁移数据库毫无收益、纯增风险** → 「Markdown 为真相源 + Admin 为管理层」完全可行且是最优解。
2. 纯 SSG + OpenResty 静态托管 → Admin 需要独立运行时（不能寄生在 Astro 前台里），服务器有跑自托管服务的先例与能力。
3. 前台 Umami 组件就绪 → Analytics 走自托管 Umami 是零前台改动路线。
4. Design token 高度体系化（单 hue oklch）→ Admin 可低成本获得同源视觉。
5. fork 上游活跃 → **Admin 代码必须与前台文件物理隔离**（新目录/新 workspace 包），否则每次 sync 上游都是冲突地狱。
6. 无测试设施 → Admin 必须自带测试（vitest + Playwright），但**不得给前台加测试负担**。

---

## 2. 当前架构图

```text
┌─────────────────────────── 开发者本机 ───────────────────────────┐
│  firefly-blog 仓库（fork of Cuteleaf/Firefly, main）              │
│  ├── src/content/{posts,dynamic,spec,projects}/*.md   ← 内容真相源│
│  ├── src/config/*.ts (27 文件)                        ← 结构化配置│
│  ├── src/pages/**                                     ← 纯静态路由│
│  ├── public/{gallery,pio,artalk-ui,assets}            ← 静态资源  │
│  └── scripts/*(8 步构建链)                                        │
│         │ pnpm build（8 步）                                      │
│         ▼ dist/（纯静态）                                         │
│         │ SSH / rsync（人工）                                     │
└─────────┼─────────────────────────────────────────────────────────┘
          ▼
┌─────────────────── 腾讯云 Lighthouse ────────────────────────────┐
│ OpenResty :443 liqiming.top                                      │
│  ├── /            → 静态文件（dist）                              │
│  ├── /artalk/     → 反代 127.0.0.1:23366（Artalk，SQLite 评论）   │
│  └── /mascot-chat → 反代 127.0.0.1:8791（AI 代理）                │
│ （GitHub：origin=liqiming123/liqiming-blog，CI 仅检查，Pages 弃用）│
└──────────────────────────────────────────────────────────────────┘

缺失：登录/权限、可写 API、数据库、统计、审计、媒体管理、发布流水线
```

---

## 3. GitHub 开源方案调研与选型

> 调研方式：检索 2026 年活跃度、官方文档与安全公告。结论统一表述为「借鉴什么 / 为什么 / 是否适合本项目 / 我们的方案」。

### 3.1 Ghost

- **是什么**：Node.js + MySQL 的出版级博客平台，Admin 是业界标杆之一。
- **借鉴什么**：① 内容优先的后台 IA（Posts / Pages / Stats / Design / Settings 五组，无花哨仪表盘）；② 编辑器 = 左 Markdown / 右实时预览分栏，发布按钮带状态语义（草稿/定时/发布三态）；③ Dashboard 克制（近期文章 + 流速曲线 + 待办，不堆卡片）。
- **为什么不引入**：Ghost 是"平台"——内容进 MySQL、必须以 Ghost 为中心跑整站，与本仓库"Markdown 真相源 + Astro 前台"根本冲突。
- **我们的方案**：完全复刻其后台 IA 骨架与编辑器双栏模式，内容层换成直接读写 Markdown。

### 3.2 Strapi

- **借鉴什么**：① 列表页范式：Tabs（全部/已发布/草稿）+ 左侧筛选抽屉 + 批量操作条（选中后浮出）；② RBAC 权限矩阵（角色 × 动作 × 集合的勾选表）；③ Settings 中心按域分组（Global / Users & Permissions / API tokens）。
- **为什么不引入**：内容入数据库、Admin 是 React 大单体、自托管重（会抢走内容主权）。
- **我们的方案**：文章列表/批量操作/权限矩阵交互直接参考 Strapi 的成熟范式。

### 3.3 Payload CMS（3.x）

- **借鉴什么**：① **Live Preview**：iframe 加载真实前端、随打字实时刷新——这是"后台预览 = 前台样式"的最佳实现思路；② Versions + Drafts + Autosave 三件套（版本历史、diff、回滚）；③ schema 驱动的表单生成（字段定义 ↔ 表单/校验一一对应）。
- **为什么不引入**：Payload 3 深度绑定 Next.js/React 生态，引入即引入第二套前端框架。
- **我们的方案**：编辑器 Preview 采用 Payload 思路——**本地起 Astro dev/preview 渲染草稿页（真实 Firefly 样式），iframe 内嵌**；文章版本历史用 git commit 天然实现（每次保存 = 一个 commit），Admin 展示 `git log --follow <file>` 即得版本列表与 diff。

### 3.4 TinaCMS

- **借鉴什么**：Markdown 优先 + Git-backed 的内容模型；可视化编辑与文件树映射；自托管 Content API 的架构分层（auth / content modeling / editing 分离）。
- **为什么不引入**：自托管 Tina Data Layer 运维负担大（2026 年有 `@tinacms/graphql` 路径穿越 CVE-2026-33949 的教训），且其编辑体验定制到 Firefly frontmatter（category 单值、password 加密、pinyin slug、构建后处理链）成本不低于自研。
- **我们的方案**：借鉴"编辑 → 写 Markdown → Git 提交"的内容流模型，实现为轻量自研 Content Service（见 §4）。

### 3.5 Keystatic

- **借鉴什么**：① **local mode / GitHub mode 双模式**：本地开发时直接读写文件系统（零配置零攻击面），生产用 GitHub App 模式远程提交——这正是"个人博客 Admin 的最佳运行形态"；② 对 Astro 一等支持、schema 与 Content Collections 对齐。
- **为什么不直接用**：GitHub mode 需要跑 SSR runtime 或 Keystatic Cloud，与 OpenResty 纯静态生产冲突；且 Dashboard/Analytics/Media/Publish 等运营能力全部缺失。
- **我们的方案**：**采纳双模式思想**：`pnpm admin`（Local 模式，Phase 1–3）→ 服务器部署（Server 模式，Phase 4+），同一套代码经 storage adapter 切换。

### 3.6 Decap CMS（原 Netlify CMS）

Git-based Admin 先驱，但社区维护近乎停滞、依赖 OAuth Gateway 基础设施。**不采用，不深入借鉴**。

### 3.7 Umami（Analytics 后端选型，重点对比）

| 方案 | 部署 | 数据所有权 | 地理 | API | 成本 | 与本项目契合度 |
|---|---|---|---|---|---|---|
| **自托管 Umami** ✅ | Docker（umami + PostgreSQL），跑在已有腾讯云服务器 | 完全自有 | 国家级开箱（GeoLite2），城市级需配置 | REST API 齐全（summary/timeseries/pages/geo/devices/referrers/**realtime**） | 服务器已有，仅 +1 容器 | ★★★★★ **前台组件已就绪（UmamiAnalytics.astro），填 ID 即启用** |
| Umami Cloud | 免运维 | 数据在第三方 | 含 geo | 同 API | 免费档有限 | ★★★（数据所有权诉求不匹配） |
| Plausible CE | 需 ClickHouse + Postgres，更重 | 自有 | 国家级 | API 简洁 | 服务器资源占用更高 | ★★★ |
| GA4 / Clarity | 托管 | 第三方 + 广告生态 | 强 | 复杂 | 免费但隐私不友好 | ★★（与博客隐私调性冲突） |
| 纯自建（打点+SQLite） | 自己写一切 | 自有 | 任意 | 任意 | 开发量大、轮子风险 | ★★（第二期可对特殊指标补充） |

**决策（ADR-5）：自托管 Umami（Docker Compose：umami + postgres）**。隐私原则：无 cookie、聚合统计、默认仅国家级地理、不存 IP 明文（Umami 自身即此设计）；**禁止任何"随机假数据"**——Dashboard 一切数字来自 Umami API 或 Artalk API。

### 3.8 调研总结一句表

| 借鉴对象 | 落到本项目的具体产物 |
|---|---|
| Ghost | 后台 IA 分组、双栏编辑器、克制的 Dashboard |
| Strapi | 列表页 Tabs/筛选/批量操作范式、RBAC 矩阵、Settings 分组 |
| Payload | Live Preview（iframe 真实前台）、版本=git log、schema 驱动表单 |
| TinaCMS | 「编辑→写 Markdown→Git 提交」内容流 |
| Keystatic | Local/Server 双运行模式 |
| Umami | Analytics 后端 + 前台既有组件 + Admin 聚合代理 |

---

## 4. 目标架构

### 4.1 关键架构决策（ADR 摘要）

| # | 决策 | 理由（源自审计） |
|---|---|---|
| ADR-1 | **Markdown（Git 仓库）继续作为内容唯一真相源，不迁移数据库** | 9 篇文章迁移零收益；上游主题依赖该结构；用户红线"不批量迁移" |
| ADR-2 | **Admin 为独立 workspace 包（`admin/` 前端 + `server/` 后端），不进前台构建** | 前台 bundle/JS/CSS 零增长（性能红线）；依赖不污染；fork 上游零冲突 |
| ADR-3 | **双运行模式**：Local（`pnpm admin`，本机 127.0.0.1，Phase 1–3）→ Server（腾讯云 `/opt/firefly-admin`，OpenResty 反代 `/admin/`，Phase 4+） | Keystatic 双模式思想；先零攻击面开发，再按需上服务器 |
| ADR-4 | **发布流水线：Admin 写 Markdown → git commit → push origin → GitHub Actions 完整 8 步构建 → SSH rsync 到服务器** | 不改变"dist 静态 + OpenResty"本质；服务器无需装构建环境；每次发布即一次完整 CI 验证 |
| ADR-5 | **Analytics = 自托管 Umami + 前台既有组件 + Admin REST 代理聚合** | 见 §3.7 |
| ADR-6 | **评论管理 = Artalk Open API 代理**（保留 Artalk 自带后台作为兜底） | 评论数据本就在 Artalk，不重复存储 |
| ADR-7 | **结构化配置（友链/书签/导航）渐进 JSON 化**：数据移至 `src/data/*.json`，TS 文件变薄导入层，类型与前台渲染不变；Admin 写 JSON | 前台改动最小化且集中、可审；属"受控前台变更"须单独 PR 登记 |
| ADR-8 | **SQLite（better-sqlite3）仅作 Admin 运行时库**（用户/会话/审计/媒体索引/文章索引缓存），不承载内容 | 内容在 Git；库可重建（审计日志除外，纳入备份） |
| ADR-9 | **Admin 前端 = Svelte 5 + Firefly tokens 的 SPA**（Vite 独立构建），**后端 = Hono**（TS 原生、轻量、与 Astro 同生态） | 与前台同语言同栈，Agent 协作心智统一 |

### 4.2 目标架构图

```text
┌─────────────────────── 管理员侧（两种模式，同一套代码） ───────────────────────┐
│                                                                              │
│  [Local 模式]  pnpm admin → http://127.0.0.1:4322/admin                     │
│      server/ 直接读写本机仓库文件 + 本机 git + 本机 dev Preview               │
│                                                                              │
│  [Server 模式]  https://liqiming.top/admin/                                  │
│      OpenResty 反代 → /opt/firefly-admin (Hono, systemd)                     │
│      ├── 托管 admin SPA 静态产物                                              │
│      ├── /admin/api/v1/*（认证/内容/媒体/统计代理/审计/发布）                    │
│      ├── server/workdir：内容仓库 bare clone（工作副本）                       │
│      ├── admin.db（SQLite：users/sessions/audit/media/posts 索引）            │
│      └── media 存储（仓库内 public/uploads/ + 元数据入库）                     │
│                                                                              │
└──────┬───────────────────────────────┬───────────────────────────────────────┘
       │ git push（内容提交）            │ REST（只读）
       ▼                               ▼
┌────────────── GitHub ───────────┐   ┌──── 腾讯云 Lighthouse ────────────────┐
│ liqiming123/liqiming-blog       │   │ ┌── Umami（Docker，Phase 4 新增）──┐  │
│  └─ Actions: admin-deploy.yml   │───┼─▶ │ umami + postgres :3000（内网）│  │
│     8 步完整构建 → rsync dist ───┼───┼─▶ └──────────┬──────────────────────┘  │
│                                 │   │            │ 采集                      │
│                                 │   │ ┌── Artalk（既有）────────────────┐  │
│                                 │   │ │ 127.0.0.1:23366 /artalk/       │  │
└─────────────────────────────────┘   │ └─────────────────────────────────┘  │
                                      │ OpenResty :443                       │
                                      │  / → dist 静态（前台，结构不变）        │
                                      │  /admin/ → firefly-admin 服务         │
                                      │  /artalk/、/mascot-chat →（既有）     │
                                      │  /umami（可选，仅内网/带认证暴露）      │
                                      └───────────────────────────────────────┘
   访客浏览器 → 前台页面（零变化，仅多一条 Umami 匿名打点 script）
```

### 4.3 目录规划（全部为新增，不触碰前台既有文件）

```text
firefly-blog/
├── admin/                      # Admin SPA（Svelte 5 + Vite，workspace 包）
│   ├── src/
│   │   ├── app/                # 路由、布局（Shell：Sidebar/Header/Breadcrumb）
│   │   ├── components/         # DS 组件（Table/Drawer/Modal/Toast/Badge/Form…）
│   │   ├── modules/            # 业务模块（posts/editor/media/analytics/…）
│   │   ├── lib/（api client、stores、utils）
│   │   └── styles/（tokens.css ← 由 variables.styl 派生的 Admin 副本 + admin 扩展）
│   └── package.json
├── server/                     # Admin API（Hono，workspace 包）
│   ├── src/
│   │   ├── index.ts            # 入口：SPA 托管 + /admin/api/v1 路由
│   │   ├── auth/（login/session/rbac 中间件/rate-limit）
│   │   ├── content/（Content Service：md 读写/frontmatter 往返/git/pinyin slug/加密文）
│   │   ├── media/（上传/校验/索引/LQIP 触发）
│   │   ├── analytics/（Umami 代理聚合）
│   │   ├── comments/（Artalk 代理）
│   │   ├── publish/（Actions 触发/状态查询）
│   │   ├── backup/（内容/库/配置备份恢复）
│   │   ├── audit/（审计中间件 + 查询）
│   │   └── db/（SQLite schema + migrations）
│   └── package.json
├── docs/admin/                 # 本规划 + ROADMAP + 后续各模块设计文档
└── pnpm-workspace.yaml         # packages: ['.', 'admin', 'server']
```

---

## 5. 后台信息架构（Sidebar）

> 分组参考 Ghost 的"内容优先、克制工具化"原则；图标沿用前台 material-symbols；分组顺序 = 使用频率。

```text
🛈 总览
  ├── 仪表盘 Dashboard            /admin              （今日/趋势/热门/实时访客）
  └── 访问分析 Analytics           /admin/analytics    （全维度下钻 + 地理分布）

✎ 内容
  ├── 文章 Posts                   /admin/posts        （列表/草稿/回收站/批量）
  │     └── 编辑器                 /admin/posts/new | /admin/posts/:slug/edit
  ├── 动态 Moments                 /admin/moments      （对应 dynamic collection，Firefly 特色）
  ├── 页面 Pages                   /admin/pages        （about/friends/guestbook + projects）
  ├── 分类 Categories              /admin/categories   （聚合视图 + 重命名迁移工具）
  └── 标签 Tags                    /admin/tags         （聚合视图 + 合并/清理）

✦ 资源与链接
  ├── 媒体库 Media                 /admin/media        （上传/详情/使用位置/批量）
  ├── 评论 Comments                /admin/comments     （Artalk 聚合：审核/回复/删除）
  ├── 友链 Friends                 /admin/friends
  └── 导航 Navigation              /admin/navigation   （Header 菜单/页脚/社交链接）

⚙ 站点
  ├── SEO 管理                     /admin/seo          （全局默认 + 按文覆盖 + sitemap/RSS 状态）
  └── 站点设置 Settings            /admin/settings     （标题/描述/主题 hue/页面开关/评论开关…）

⛨ 系统
  ├── 用户 Users                   /admin/users        （单管理员起步，可扩展）
  ├── 操作日志 Audit Log           /admin/audit-log
  ├── 发布管理 Publish             /admin/publish      （构建状态/历史/一键发布/回滚）
  ├── 备份 Backup                  /admin/backup       （内容/配置/库，下载/恢复）
  └── 系统信息 System              /admin/system       （版本/环境/服务健康/存储）
```

移除/降级原则：`书签导航 Booknav`（低频）并入 Settings 下属标签页；`图库 Gallery` 相册管理并入 Media 下属标签页；`权限 Roles` 并入 Users 标签页——**避免 Sidebar 膨胀成第二个前台导航**。

---

## 6. 页面 Sitemap

```text
/admin/login                       登录（无 Shell）
/admin                             Dashboard（默认重定向目标）
/admin/analytics                   /geo /pages /referrers /devices（Tabs）
/admin/posts                       列表（?status=&category=&tag=&q=&page=&sort=）
/admin/posts/new                  编辑器（新建）
/admin/posts/:slug/edit           编辑器（编辑，slug=文件名去扩展名）
/admin/posts/:slug/preview        草稿真实预览（Local 模式 iframe Astro dev）
/admin/moments                    动态列表 + 快速发布框（对齐 pnpm new-dynamic）
/admin/pages                       spec/projects 页面列表
/admin/pages/:id/edit             Markdown 编辑（简单版编辑器）
/admin/categories | /admin/tags   聚合管理（含重命名/合并向导）
/admin/media                       网格 + 筛选；/admin/media/:id 详情 Drawer
/admin/comments                    Artalk 列表（审核/垃圾/黑名单 Tabs）
/admin/friends | /admin/navigation
/admin/seo                        全局 + 覆盖层 + 生成物状态
/admin/settings                    分组 Tabs（基本/外观/页面开关/评论/统计/书签/图库）
/admin/users                       用户 + 角色（Tabs）
/admin/audit-log | /admin/publish | /admin/backup | /admin/system
```

所有列表页统一支持：搜索、筛选、排序、分页、Loading（Skeleton）、Empty（含引导动作）、Error（重试）、无权限（403 面板）。

---

## 7. 模块清单

| 模块 | 优先级 | Phase | 依赖 | 说明 |
|---|---|---|---|---|
| Admin Shell（Sidebar/Header/Breadcrumb/命令面板） | P0 | 1 | — | 一切页面容器 |
| Design System（Admin 版组件库 + 状态规范） | P0 | 1 | — | §18 |
| Auth（登录/会话/CSRF/限速） | P0 | 1 | Shell | §12 |
| 审计日志基建（中间件） | P0 | 1 | Auth | 所有写操作自动记录 |
| Content Service（md 读写/frontmatter 往返/git） | P0 | 2 | —（后端独立） | 核心引擎，§11 |
| 文章管理（列表/批量/回收站） | P0 | 2 | Content | |
| 编辑器（双栏 + 元数据表单 + 自动保存） | P0 | 2 | Content | §11.4 |
| 草稿预览（真实 Firefly 样式） | P1 | 2 | 编辑器 | Local 模式 iframe dev server |
| 动态 Moments 管理 | P1 | 3 | Content | 快速发布 + 列表 |
| 页面管理（spec/projects） | P1 | 3 | Content | 简单编辑器复用 |
| 分类/标签管理（聚合 + 重命名迁移） | P1 | 3 | Content | 重命名=批量改 frontmatter |
| 媒体库 | P1 | 3 | Auth | 上传→`public/uploads/`+LQIP 联动 |
| Umami 部署 + 前台启用 | P1 | 4 | 服务器 | 运维任务 + 填 analyticsConfig |
| Dashboard（五层数据） | P1 | 4 | Umami | 全部真实 API |
| Analytics 页（维度下钻 + 地理） | P1 | 4 | Umami | 国家级 + 中国省级（见 §13） |
| 评论聚合（Artalk 代理） | P2 | 5 | Auth | 审核/回复/删除 |
| 友链管理（JSON 化改造 + CRUD） | P2 | 5 | ADR-7 | 前台受控变更 |
| 导航管理（navBar JSON 化 + CRUD） | P2 | 5 | ADR-7 | 含排序/图标选择 |
| SEO 管理 | P2 | 5 | 编辑器 | 默认值 + 按文覆盖 |
| 站点设置（安全字段子集） | P2 | 6 | ADR-7 | 白名单字段，非全量配置暴露 |
| 发布管理（Actions 触发/状态） | P2 | 6 | Content | §17 |
| 备份/恢复 | P2 | 6 | Content | §16 |
| 用户/角色 | P2 | 6 | Auth | 单管理员 + 预留角色 |
| 搜索分析 | P3 | 7+ | 前台搜索埋点 | Pagefind 无搜索日志，需自建事件（§15 附） |
| 安全加固/测试/性能/验收 | P0 | 贯穿 | 全部 | Agent 12 |

---

## 8. Agent 分工

> 原则：一个 Agent 一个文件域，**任何两个 Agent 不同时改同一文件**；后端接口先出契约（OpenAPI/TS 类型），前端按契约并行。

| Agent | 职责 | 文件域（独占） | 关键约束 |
|---|---|---|---|
| **A0** 架构 | 本规划维护、契约评审、跨 Agent 仲裁 | `docs/admin/*` | 不写业务代码 |
| **A1** Shell/DS/Auth | Admin Shell、DS 组件库、登录、会话、RBAC、审计中间件、限速 | `admin/src/app/`、`admin/src/components/`、`server/src/auth/`、`server/src/audit/`、`server/src/index.ts` | 组件必须带全状态（Loading/Empty/Error/Disabled/403） |
| **A2** Content Service | frontmatter 往返、md 读写、pinyin slug、加密文处理、git 封装、posts 索引 | `server/src/content/`、`server/src/db/` | 对既有 9 篇文章往返无损；先出 TS 类型契约 |
| **A3** 文章管理 | 列表/筛选/批量/回收站/分类标签聚合页 | `admin/src/modules/posts/`（list 部分） | 不改编辑器文件 |
| **A4** 编辑器/预览 | 双栏编辑器、元数据表单、自动保存、Preview、版本（git log） | `admin/src/modules/editor/`、`server/src/content/preview.ts` | 表单字段 § 1.2 schema 一一对应 |
| **A5** 页面/动态/分类标签 | moments、pages、categories/tags（重命名迁移） | `admin/src/modules/moments|pages|taxonomy/` | 重命名必须走批量迁移确认流 |
| **A6** 媒体库 | 上传/校验/网格/详情/使用位置/LQIP 联动 | `admin/src/modules/media/`、`server/src/media/` | SVG 默认拒绝（可配置）；大小≤5MB |
| **A7** 评论/友链/导航 | Artalk 代理、friends/navigation CRUD（含 ADR-7 JSON 化前台薄改） | `admin/src/modules/comments|friends|navigation/`、`server/src/comments/`、`src/config/friendsConfig.ts`（薄化） | 前台改动仅限薄导入层 |
| **A8** Analytics/Dashboard | Umami 部署脚本、代理聚合、Dashboard 五层、地理图 | `admin/src/modules/dashboard|analytics/`、`server/src/analytics/`、`deploy/umami/` | 只展示真实 API 数据 |
| **A9** SEO | 全局 SEO、按文覆盖、生成物状态（sitemap/RSS/OG） | `admin/src/modules/seo/` | 默认值优先，不强制填字段 |
| **A10** 用户/权限/日志 | users/roles UI、audit-log 查询 UI | `admin/src/modules/users|audit/`、`server/src/users/` | 复用 A1 的 RBAC 中间件，不另写一套 |
| **A11** 设置/备份/发布 | settings、backup、publish（Actions 集成） | `admin/src/modules/settings|backup|publish/`、`server/src/{settings,backup,publish}/` | settings 走字段白名单 |
| **A12** 质量总验 | 测试补齐、安全扫描、性能审计、最终验收 | `admin/tests/`、`server/tests/`、`.github/workflows/admin-*.yml` | 有权提 issue 无权改他人模块 |

---

## 9. Agent 依赖关系

```text
            A0（契约/仲裁，贯穿）
              │
        ┌─────▼─────┐
   Phase 1:   A1 ──────────────┐（Shell+DS+Auth+审计 = 全部页面地基）
        └─────┬─────┘          │
              │                │
   Phase 2:   A2（Content Service，契约先行）
              │        ┌───────┼─────────┐
        ┌─────▼───┐ ┌──▼──┐ ┌─▼─┐  ┌─────▼────┐
        │ A3 列表  │ │ A4  │ │A5 │  │ A6 媒体   │   ← 文件域互斥，可并行
        └─────────┘ │编辑器│ └───┘  └──────────┘
                    └─────┘
   Phase 4:   A8（Umami/Dashboard）          ← 仅依赖 A1
   Phase 5:   A7（评论/友链/导航） A9（SEO，依赖 A4 表单挂载点）
   Phase 6:   A10（用户） A11（设置/备份/发布，依赖 A2）
   贯穿:      A12（每 Phase 结束介入验收）

硬依赖链：A1 → 一切前端模块；A2 → 一切内容写操作
可并行窗口：A3/A4/A5/A6 四路并行（Phase 2–3）；A7/A8/A9 三路并行（Phase 4–5）
共享文件唯一清单（须 A0 协调）：
  - server/src/index.ts（路由注册，由 A1 管理根骨架，各 Agent 提 PR 挂载）
  - admin/src/app/routes.ts（同上）
  - pnpm-workspace.yaml / package.json（仅 A0/A1）
  - src/config/*（ADR-7 薄化，仅 A7/A11 受控触碰）
```

---

## 10. 数据模型

### 10.1 内容层（无 Schema 变更，文件即数据）

| 实体 | 存储 | Admin 操作映射 |
|---|---|---|
| 文章 | `src/content/posts/<filename>.md` | CRUD=文件增删改；状态：`draft:true/false`；回收站=移动至 `src/content/_quarantine/`（复用既有隔离目录约定）；定时发布=`published` 未来日期 + `draft:false`（前台 getStaticPaths 已按 draft 过滤，**定时=设未来日期即可，需验证前台排序表现**，Phase 2 验收项） |
| 动态 | `src/content/dynamic/YYYY-MM-DD-HHmmss.md` | 新建=按 siteConfig.timezone 生成文件名 |
| 页面 | `src/content/spec|projects/*.md(x)` | 编辑 frontmatter+正文 |
| 分类/标签 | 派生自 posts frontmatter | "重命名分类"= 遍历受影响文章批量改 frontmatter（迁移向导 + 确认 + git 单提交） |
| 友链/书签/导航 | `src/data/*.json`（ADR-7 迁移后） | CRUD JSON |

### 10.2 Admin 运行时库（SQLite，`server/data/admin.db`）

```sql
-- 用户与会话（Phase 1）
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,            -- argon2id
  role TEXT NOT NULL DEFAULT 'admin',     -- admin | editor | author | viewer（Phase 6 启用差异）
  display_name TEXT, avatar TEXT,
  disabled INTEGER DEFAULT 0,
  created_at TEXT, last_login_at TEXT
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                    -- sid
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,               -- sha256(cookie 值)，cookie 不落库
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT,
  ip TEXT, user_agent TEXT                -- 审计用途，定期清理
);

-- 审计日志（Phase 1 起全部写操作自动记录）
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER, username TEXT,
  module TEXT NOT NULL,                   -- posts/media/comments/…
  action TEXT NOT NULL,                   -- create/update/delete/publish/login/…
  target_type TEXT, target_id TEXT,       -- 如 ("post","redis-intrusion-postmortem")
  summary TEXT,                           -- 「修改文章《xxx》」
  result TEXT NOT NULL DEFAULT 'ok',      -- ok | denied | error
  detail_json TEXT,                       -- 字段级 diff 摘要（脱敏：不含 password/正文全文）
  ip TEXT, user_agent TEXT, created_at TEXT
);

-- 媒体索引（Phase 3）
CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL, path TEXT NOT NULL,   -- 仓库相对路径 public/uploads/...
  url TEXT NOT NULL, mime TEXT, size INTEGER,
  width INTEGER, height INTEGER, sha256 TEXT,
  alt TEXT, uploaded_by TEXT, created_at TEXT
);
CREATE TABLE media_usages (               -- 使用位置（保存文章时扫描正文引用重建）
  media_id INTEGER NOT NULL, ref_type TEXT, ref_id TEXT,   -- ("post","slug")
  PRIMARY KEY (media_id, ref_type, ref_id)
);

-- 文章列表缓存（Phase 2，加速；真相始终是 frontmatter，可随时重建）
CREATE TABLE posts_index (
  slug TEXT PRIMARY KEY,                  -- = 文件名去扩展名（URL 语义）
  title TEXT, status TEXT,                -- published | draft | scheduled | trashed
  category TEXT, tags_json TEXT,
  published_at TEXT, updated_at TEXT, file_mtime TEXT,
  word_count INTEGER, encrypted INTEGER, synced_at TEXT
);

-- 设置覆盖层（Phase 6，白名单字段）
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT, updated_by TEXT, updated_at TEXT);

-- 计数补充（Phase 4 可选）：来自 Artalk 的 per-post 评论数缓存
CREATE TABLE comment_counts (slug TEXT PRIMARY KEY, count INTEGER, synced_at TEXT);
```

Migration 方式：手写编号 SQL（`server/src/db/migrations/0001_*.sql`）+ 启动时自动执行未应用项，**每个 migration 必须有对应 down 脚本**（满足"可回滚"红线）。

---

## 11. API 规划

> 统一前缀 `/admin/api/v1`；JSON；写操作需 `X-CSRF-Token`；错误体 `{ error: { code, message } }`；分页统一 `?page=&pageSize=` 返回 `{ items, total, page, pageSize }`。

### 11.1 认证与会话

```text
POST /auth/login        { username, password }  → Set-Cookie: sid（HttpOnly/Secure/SameSite=Lax）+ { csrfToken }
POST /auth/logout
GET  /auth/me           → { user, permissions[] }
PUT  /auth/password     { old, new }
```

### 11.2 文章（Content Service）

```text
GET    /posts?status=&category=&tag=&q=&sort=&page=        列表（走 posts_index + 实时校验）
GET    /posts/:slug                                        单篇（frontmatter + 正文 + git log 摘要）
POST   /posts                                              新建 { filename?, title, ...frontmatter, content }
PUT    /posts/:slug                                        全量保存（frontmatter + 正文，服务端 zod 校验同款 schema）
PATCH  /posts/:slug/status                                 { status: draft|published|trashed|scheduled, publishedAt? }
POST   /posts/:slug/duplicate
GET    /posts/:slug/versions                               git log --follow（版本列表）
GET    /posts/:slug/versions/:sha                          版本详情/diff
POST   /posts/:slug/revert                                 回滚到某版本（生成新 commit）
GET    /posts/:slug/preview-url                            Local 模式返回 dev 预览 URL（带一次性 token）
POST   /posts/batch                                        { action: delete|publish|draft|setCategory|addTags|moveTrash, slugs[] }
GET    /taxonomies                                         分类+标签聚合（计数）
POST   /taxonomies/rename                                  { type, from, to }（批量迁移）
POST   /taxonomies/tags/merge                              标签合并
```

### 11.3 其余模块（摘要）

```text
# 动态
GET/POST /moments, DELETE /moments/:id, PATCH /moments/:id/pin
# 页面
GET/PUT  /pages/:collection/:id                            （spec|projects）
# 媒体
GET  /media?type=&q=&page=   POST /media/upload（multipart，白名单 mime，≤5MB，sharp 校验真实类型）
GET  /media/:id（详情+usages） PUT /media/:id（alt/文件名）  DELETE /media/:id（已被引用时阻止并提示）
# 评论（Artalk 代理）
GET  /comments?status=&page=   POST /comments/:id/moderate|reply|delete   GET /comments/blacklist
# Analytics（Umami 聚合）
GET  /analytics/summary?range=today|7d|30d|90d|custom&from=&to=
GET  /analytics/timeseries|pages|referrers|devices|geo|realtime
# SEO
GET/PUT /seo/global（默认值）   GET /seo/posts?status=missing（缺 SEO 字段清单）
# 设置
GET/PUT /settings/:group（basic|appearance|pages|comment|analytics|booknav|gallery）
# 用户与审计
GET/POST/PUT /users（角色管理 Phase 6）   GET /audit-logs?module=&user=&page=
# 发布
POST /publish/deploy（触发 Actions）  GET /publish/status（当前 run + 最近历史）  GET /publish/history
# 备份
POST /backup（全量：内容仓库快照+admin.db+settings）  GET /backup（列表）  GET /backup/:id/download  POST /backup/:id/restore
# 系统
GET /system/info（版本/Node/磁盘/服务健康/Umami 连通/Artalk 连通）
```

### 11.4 编辑器（前端形态，最重要的单一模块）

- **布局**：Ghost 式三区——顶部操作条（保存状态/预览/发布）+ 左侧元数据 Drawer（分类/标签/封面/时间/置顶/SEO 折叠组）+ 中央双栏（Markdown 源码 ↔ 预览，可切换单栏）。
- **正文编辑**：CodeMirror 6（Markdown 高亮/快捷键/图片拖拽落成 `![](url)`），预览用前台同源渲染链——**预览不追求 100% 等于前台**，等价渲染在 Preview 页完成；编辑器内预览用 markdown-it + 前台 markdown.css 的 Admin 引入版（表格/代码/Callout 近似）。
- **表单 ↔ schema**：字段与 §1.2 frontmatter 一一对应，zod schema 由 `server/src/content` 单一来源导出、前端复用（schema 驱动表单，Payload 思路）。
- **自动保存**：编辑 5s 防抖 → 草稿存 `server` 端 `.drafts/`（git 之外的暂存目录，不产生 commit 噪音）；显式保存 = 1 次 git commit。未保存离开拦截（beforeunload + 路由守卫）。
- **编辑冲突**：保存时校验文件 mtime/hash，若外部变更则 409 并展示 diff，二选一（覆盖/合并）。
- **特殊文章**：`password` 非空时进入加密编辑模式：正文编辑保存后由 server 端执行同参数加密流程（复用 `crypto-utils.ts` 逻辑的 Node 版），密码字段仅显示"已设置（修改请输入新值）"。
- **slug/URL**：表单顶部只读显示 URL（= 文件名），"重命名"是独立确认操作（提醒破链风险 + 自动生成 301 建议）。

---

## 12. Auth / Permission 规划

- **Phase 1：单管理员**。首次启动 `pnpm admin` 引导创建管理员（用户名+密码，argon2id 哈希）。角色字段就位但只有 admin。
- **Phase 6：启用角色模型**（RBAC，借鉴 Strapi 矩阵）：

| 权限 | admin | editor | author | viewer |
|---|---|---|---|---|
| 文章查看 | ✅ | ✅ | ✅ | ✅ |
| 文章创建/编辑（自己的） | ✅ | ✅ | ✅ | ❌ |
| 文章发布/删除（任意） | ✅ | ✅ | ❌ | ❌ |
| 媒体管理 | ✅ | ✅ | 上传/引用 | ❌ |
| 评论管理 | ✅ | ✅ | ❌ | ❌ |
| 统计查看 | ✅ | ✅ | ❌ | ✅（只读） |
| 站点设置/用户/系统 | ✅ | ❌ | ❌ | ❌ |

- 实现层：`server/src/auth/rbac.ts` 导出 `can(user, action, scope)`；每个 API 路由声明所需权限，中间件统一校验——**前端按钮隐藏只是体验，服务端校验是唯一防线**（红线）。
- 会话：cookie `ff_admin_sid`，HttpOnly + Secure（Server 模式）+ SameSite=Lax；7 天滑动过期；登出/改密全端失效。CSRF：双提交 cookie（读接口 GET/HEAD 豁免）。
- 登录防爆破：IP+账号双维度限速（10 次/15 分钟 → 锁定 15 分钟，进审计日志）；登录失败不提示"用户名还是密码错"。

---

## 13. Analytics 规划

### 13.1 采集（前台改动 = 仅填一个 ID）

- 部署 Umami（Docker Compose 于腾讯云：`umami + postgresql`，仅监听内网，由 OpenResty `/umami/` 反代且加 Basic Auth 或 IP 白名单）。
- 前台唯一动作：`analyticsConfig.ts` 填 `umamiAnalytics.websiteId` 与 src（`UmamiAnalytics.astro` 既有逻辑即生效，含 Web Vitals 可选项）。
- 隐私承诺：无 cookie、无指纹、IP 仅用于反重与国家级 geo 后即弃；**不存 IP 明文于任何 Admin 展示**；robots 尊重；评论区 IP 展示沿用 Artalk 自身脱敏。

### 13.2 Dashboard 五层（全部真实数据，无假数）

| 层 | 内容 | 数据源 |
|---|---|---|
| 1 概览卡 | 今日 PV/UV/Sessions、本周、本月、累计文章（Content Service）/评论（Artalk count）/标签/分类（taxonomies） | Umami `/api/websites/:id/stats` + 本站聚合 |
| 2 趋势 | PV/UV/Sessions 曲线，7/30/90/自定义 | Umami `/timeseries` |
| 3 内容 | 热门文章（PV/UV/停留）、热门页面、趋势变化 | Umami `/metrics?type=url` + path↔slug 映射 |
| 4 访客 | 国家（GeoLite2 内置）、设备/浏览器/OS、Referrer/搜索引擎、入口页 | Umami `/metrics` 各维度 |
| 5 实时 | 当前在线数 + 最近事件流 | Umami `/realtime`（轮询 10s） |

**地理展示**：世界地图（国家级，SVG/echarts 按需）+ Top 国家/地区排行。**中国省级**：Umami 自托管默认仅国家级——诚实方案二选一（Phase 4 决策）：
  a) Umami 配置 MaxMind GeoLite2 City 库（需注册免费 license、定期更新脚本、仅展示到省/市级聚合，承诺不展示城市以下粒度）；
  b) OpenResty 离线日志分析（ngx geoip 模块 + 日志脚本入 SQLite，T+1 聚合）。
默认走 a，若 MaxMind 许可或数据质量不佳降级为国家地图 + 排行。

### 13.3 搜索分析（Phase 7+）

Pagefind 是纯前端静态搜索、无查询日志。方案：前台 AdvancedSearch 提交时向 Admin server 发一条匿名事件（`POST /admin/api/v1/events/search`，仅记关键词+结果数+时间，无用户标识），Umami `sendEvent` 亦可承载——据此产出热门关键词/零结果词（反向指导写作）。

---

## 14. Media 规划

- **存储**：`public/uploads/YYYY/MM/<hash-prefix>-<safe-name>`，**图片进 Git 仓库**（当前规模合理），server 端 sharp 统一转 webp（质量对齐 `imageOptimization.quality=85`）+ 生成缩略图；`generate-lqips.ts` 的 LQIP 机制联动（构建时自动覆盖新图）。
- **允许类型**：jpg/png/webp/avif/gif（≤5MB，GIF 不转码）；SVG **默认拒绝**（XSS 面），确需时设置白名单开关 + 服务端 sanitize（sanitize-html 白名单属性）。
- **功能**：拖拽/粘贴上传、网格浏览（按类型/日期/文章筛选）、详情 Drawer（尺寸/大小/MIME/上传时间/**使用位置列表**（media_usages））、复制 URL、插入文章（编辑器联动）、批量删除（被引用项强阻止并提示引用文章）。
- **与前台关系**：封面图（frontmatter `image`）从媒体库选择；`public/gallery/**` 图库相册列在 Media 的"图库"标签页（只读 + 相册配置跳转 Settings）。

---

## 15. SEO 规划

- **现状盘点**（审计）：sitemap（astro sitemap + 页面开关过滤）、RSS/Atom 全文、`og/[...slug].png` OG 图自动生成（已启用）、robots.txt 构建生成、每篇 frontmatter 有 description。**SEO 基建已相当完整，Admin 的工作是"可见 + 可控 + 缺失提醒"，不是重建**。
- **Global SEO**：title 模板、description、keywords（写回 siteConfig 白名单字段）、OG 默认图、robots 策略（含 noindex 预览页确认）、canonical 域名。
- **Post SEO**：编辑器内折叠组（SEO Title/Description/Keywords/OG Image 覆盖/Canonical）——**全部可选，空 = 用默认**（自动 SEO 默认值原则：description 空则取摘要，OG 图空则用自动生成）。
- **SEO 健康度**：列表页 SEO 状态列（缺 description/超长 title/无封面）；`GET /seo/posts?status=missing` 汇总。
- **生成物状态页**：最近构建的 sitemap 条数、RSS 条数、OG 图覆盖数（来自 Publish 构建产物回传）。

---

## 16. Backup 规划

| 对象 | 方式 | 保留 |
|---|---|---|
| 内容（Markdown+配置+媒体） | `git bundle` + tar（本质上 git 历史已是备份，bundle 用于异地） | 每次发布前自动 + 手动 |
| admin.db | SQLite `VACUUM INTO` 快照 | 每日 + 变更前 |
| 备份产物 | `server/data/backups/` + 一键下载 | 本地 30 份滚动 |

- **手动备份**：Backup 页"立即备份"（全量三件套）。
- **定时备份**：server 模式下 systemd timer 每日 03:30。
- **恢复**：上传/选择备份 → 校验完整性（sha256 + zod 内容校验）→ 预览将恢复的内容清单 → 确认 → 恢复流程：先自动做"恢复前快照"（失败可回滚到恢复前状态）→ 内容恢复 = git 层面 `reset` 到对应提交/解包 bundle（**绝不直接覆盖未提交的工作区变更，若有则中止并提示**）。
- **红线落地**：所有后台写操作前自动单文件快照（`server/data/undo/<ts>/`），单篇误删可秒级找回；删除文章=移入 quarantine 目录而非物理删除。

---

## 17. Publish 规划（发布流水线）

**核心链路（Save → Preview → Publish → Build → Deploy）**：

```text
编辑器保存（git commit，本地/服务器工作副本）
   → [可选] Preview：Local 模式 = Astro dev server iframe 渲染真实样式
              Server 模式 = workflow_dispatch 构建 Preview 产物到 /preview/<sha>/（P3 优化项）
   → Publish（点击发布）
      → git push origin main（内容提交 + [skip ci] 之外触发）
      → GitHub Actions admin-deploy.yml：
           checkout → pnpm install --frozen-lockfile → 完整 8 步 pnpm build
           → astro check + tsc + biome（复用 build.yml 三件套）
           → SSH（deploy key，secrets）rsync dist/ → 服务器 OpenResty 目录（原子切换）
      → 状态回传：Actions run 状态由 Admin 轮询 GitHub API 展示（发布历史/耗时/失败日志链接）
```

- **不改变生产链本质**：仍是"完整构建 → dist 静态 → OpenResty"，只是触发者从"人工本地"变为"Admin 一键"。
- **服务器本地构建备选**：若 Actions 不可用（网络/配额），server 端可直接在本机执行 `pnpm build`（需要服务器具备 Node22 环境，作为降级路径写入 publish 模块设置）。
- **回滚**：发布历史任一历史构建可重新部署（Actions 缓存产物 or 重建）；内容回滚 = `POST /posts/:slug/revert`（git revert 单文件）→ 重新发布。
- **安全**：deploy key 仅写入 `liqiming123/liqiming-blog`；Actions secrets 登记清单化（ADMIN_DEPLOY_KEY 等，禁止入库）。

---

## 18. Design System 规划

### 18.1 原则

工具优先但保留博客气质；克制（不满屏卡片、不滥用圆角/彩色数据卡）；与前台"同一个产品"。

### 18.2 Token（来源：`variables.styl` 派生为 `admin/src/styles/tokens.css`）

- **色彩**：直接复用 `--primary/--page-bg/--card-bg/--line-divider/--muted/--btn-*` 全套（oklch + `--hue` 驱动）；Admin 锁定 hue 跟随 siteConfig（不做后台换色，减少变量）。
- **语义扩展色**（新增，同一 oklch 体系派生）：success（hue 145）、warning（hue 85）、danger（hue 25）、info（=--primary）——用于状态徽标/Toast，禁止再引入色板。
- **圆角**：卡片 `--radius-large: 1rem`；输入/按钮 `--radius-md: 8px`；Badge `--radius-full`。**表格、输入框不使用 1rem 大圆角**（信息密度区收敛）。
- **字体**：正文系统栈、代码 JetBrains Mono（与前台一致）；表格数字 `font-variant-numeric: tabular-nums`。
- **间距/阴影/缓动/z-index**：沿用 variables.styl 对应段。
- **暗色**：同一 `html.dark` 机制 + 同一 localStorage key，登录页即提供切换。

### 18.3 布局

- Shell：左侧 Sidebar（240px，可折叠为 64px 图标态；移动端抽屉式）+ 顶 Header（面包屑 + 全局搜索/命令面板 ⌘K + 主题切换 + 用户菜单）+ 内容区 `max-w-(--page-width)` 内边距 24px。
- 不做二级 Sidebar；子导航用页内 Tabs。

### 18.4 组件规范（`admin/src/components/`，全部由 A1 统一实现）

| 组件 | 规范要点 |
|---|---|
| DataTable | 行 hover `--btn-card-bg-hover`；行高 44px；斑马纹关闭；边框 `--line-divider`；批量选择列；列排序/自定义列后续 |
| FilterBar | 搜索输入 + 下拉筛选（复用 dropdown 原语）+ Tabs 状态切换，粘性置于表格上方 |
| Tabs | 下划线式，活动项 `--primary` |
| Drawer | 右侧滑出 480px，遮罩 rgba(0,0,0,.4)，esc 关闭，详情/编辑轻场景 |
| Modal | 居中 `--radius-large`，危险操作标题红（danger 色），必须显式按钮文案（禁"确定"） |
| Toast | 右上角堆叠，success/error/info/warning 四型，含 Undo 动作位（删除类操作 5s 内可撤销——本地暂存恢复） |
| Badge/Status | 草稿=muted、已发布=success、定时=info、回收站=danger、已加密=图标锁+muted |
| Form | label 上置；必填 `*`；错误行内 danger 文案 + 输入框 danger 描边；禁用态 opacity+cursor |
| Pagination | 前后 + 页码跳转（复用前台 PageJump 交互习惯） |
| Skeleton | 卡片/表格两种骨架，shimmer 用 `--muted` |
| Empty | 图标（material-symbols outline）+ 一句话 + 主行动按钮 |
| ErrorBoundary | 页面级错误面板 + 重试 + 错误码 |
| 403 Panel | 无权限统一面板（含"需要什么权限"说明） |
| CommandPalette | ⌘K 全局：快速跳模块/搜索文章/快捷动作（P2 体验项） |

### 18.5 状态覆盖矩阵（每个模块页面必须全部实现）

`Loading(Skeleton) / Empty(含引导) / Error(可重试) / Success(Toast) / Disabled(无权限或依赖未就绪) / Partial(数据源离线，如 Umami 未部署时 Dashboard 显示"未接入"卡片而非报错)`

### 18.6 性能隔离红线

Admin SPA 独立构建（不进 `src/pages`、不进前台任何 import 图）；前台唯一可能的新增 = Umami 一条 script（既有组件）。CI 增加 bundle 体积对比检查（`_astro` 总量 diff 超阈值报警）。

---

## 19. Git 工作流

```text
main                生产分支（对应线上；受保护：仅 PR 合并，禁止直推——除内容提交的自动 push 走 CI 白名单）
develop             集成分支（Phase 1 起从 main 切出，Phase 间合回 main）
feat/admin-shell    A1
feat/admin-content  A2
feat/admin-posts    A3      feat/admin-editor  A4      feat/admin-taxonomy-pages A5
feat/admin-media    A6      feat/admin-engagement A7（评论/友链/导航）
feat/admin-analytics A8     feat/admin-seo A9
feat/admin-users-audit A10  feat/admin-ops A11（settings/backup/publish）
chore/…             杂项
```

规则（承接 CONTRIBUTING.md 既有约定并加强）：

1. 每个 Agent 独立分支，从最新 `develop` 切出；任务内小步提交（Conventional Commits）。
2. **PR 三件套必须绿**：`astro check` + `tsc --noEmit` + `biome` + 完整 `pnpm build`（CI 复用 build.yml 逻辑 + admin/server 各自 test）。
3. **禁止跨域修改**：只改自己文件域；确需动他人域（契约变更）→ 先在 A0 处登记契约 PR。
4. **API/Schema 变更登记**：`docs/admin/CHANGELOG-API.md` 记录每次 API/DB migration 变更（含 down 方案）。
5. **前台文件触碰白名单**（仅 ADR-7 相关 PR 允许，且必须最小化 + 截图）：`src/config/friendsConfig.ts`、`src/config/booknavConfig.ts`、`src/config/navBarConfig.ts`、`src/config/analyticsConfig.ts`、`src/data/*.json`（新增）。其余 `src/**` 一律禁改。
6. 生产配置（`docs/deploy.md` 所涉服务器配置、secrets、`lighthouse_liqiming.pem`）禁止入库禁修改。
7. 删除未知文件、大规模重构：单独任务 + A0 评审。
8. **上游同步流程**：定期 `git fetch upstream && merge upstream/master` 到 develop——因 Admin 全部隔离在新目录，预期零冲突；冲突解决责任在触碰前台文件的 Agent。

---

## 20. 测试策略

| 层 | 工具 | 范围 | 责任 |
|---|---|---|---|
| 单元 | Vitest | **A2 重点**：frontmatter 往返保真（用真实 9 篇文章做快照测试：读→写→diff 必须为空，除显式变更字段）、pinyin slug、加密文往返、RBAC can()、media 类型校验 | 各 Agent 自带 |
| 契约 | Vitest + supertest | server API：auth 流（登录/限速/CSRF）、posts CRUD、批量操作、409 冲突 | 各 Agent |
| E2E | Playwright（Local 模式跑） | 冒烟链路：登录 → 新建文章 → 保存 → 预览 → 发布 → 列表可见；媒体上传；评论审核 | A12 |
| 视觉回归 | Playwright screenshot | Shell/DS 关键页亮暗两色基线 | A12 |
| 构建 | CI | 前台三件套 + `pnpm build` 完整 8 步 + **dist 体积对比**（防前台性能倒退）+ admin/server typecheck/lint | A12 维护 workflow |
| 发布验收 | 手动 checklist | 每 Phase 验收标准（ROADMAP） | A0 + 用户 |

既有项目无测试设施 → 测试仅落在 `admin/`、`server/` 新包内，**不给前台引入任何测试依赖**。

---

## 21. 安全策略

| 项 | 方案 |
|---|---|
| 认证 | argon2id；登录限速（IP+账号，10 次/15min 锁定）；会话 7 天滑动；改密全端失效 |
| Cookie | `ff_admin_sid`：HttpOnly + Secure + SameSite=Lax；Path=/admin |
| CSRF | 双提交 cookie（`X-CSRF-Token`），写方法强制 |
| XSS | Svelte 默认转义；Markdown 预览经 sanitize-html；SVG 上传默认禁用；CSP 响应头（Server 模式：`default-src 'self'` 起步） |
| 权限 | 服务端 RBAC 中间件强制（§12）；前端隐藏仅为体验 |
| 上传安全 | 扩展名+MIME+magic bytes（sharp 读像）三重校验；文件名规范化+hash 前缀；≤5MB；禁止可执行扩展名 |
| Rate Limit | 登录/上传/发布触发类接口全局限速（令牌桶），超限 429 + 审计 |
| 传输 | 全站 HTTPS（既有）；Server 模式 Admin 仅经 OpenResty TLS 入口暴露，Umami postgres/服务全部内网 |
| 密钥管理 | Umami API key、GitHub token、Artalk token 一律环境变量（`server/.env`，gitignore 已覆盖）；**零密钥入库**（承接 AGENTS.md 红线） |
| 审计 | 全部写操作 + 登录成败 + 权限拒绝入库（§10.2），敏感字段（password/正文）脱敏 |
| 依赖安全 | CI 加 `pnpm audit --prod` 高危阻断；Admin 不引入重量级依赖（红线：小功能不引大库） |
| 攻击面收敛 | Local 模式仅绑 127.0.0.1；Server 模式可选 IP 白名单 + 二次认证（Basic Auth 前置）开关 |

---

## 22. 性能策略

1. **前台零负担**（红线）：Admin 独立构建；前台仅新增 Umami 打点（async script，不影响 LCP）；CI 体积门禁。
2. **Admin SPA**：路由级代码分割；表格虚拟滚动（文章>200 时）；图表库（echarts 或 uPlot）按需异步加载。
3. **Server**：posts_index 缓存避免每次列表全量读 md；Umami 聚合结果 60s 内存缓存（Dashboard 多人刷新场景）；sharp 流式处理上传。
4. **构建时长**：Actions 使用 pnpm store 缓存；发布构建预计 3–6 分钟（现有 8 步链不变），Publish 页展示各步耗时。

---

## 23. 分阶段开发计划（概览）

> 详细任务/验收见 [ADMIN_ROADMAP.md](./ADMIN_ROADMAP.md)。顺序相对用户初始建议的调整：**内容服务层（A2）从 Phase 2 前置为 Phase 2 首任务**；友链/导航的 JSON 化并入 Phase 5（需前台受控变更，靠后降低风险）；发布流水线提前到 Phase 6（依赖低可并行）。

| Phase | 主题 | 主要 Agent | 可并行度 |
|---|---|---|---|
| 0 | 审计 + 规划（本文档） | A0 | ✅ 已完成 |
| 1 | Workspace 改造 + Shell + DS + Auth + 审计基建（Local 模式跑通） | A1 | 单线（地基） |
| 2 | Content Service 契约 → 文章管理 + 编辑器 + Preview | A2 → A3/A4 | **A3/A4 并行** |
| 3 | 动态/页面/分类标签 + 媒体库 | A5/A6 | **双线并行** |
| 4 | Umami 部署 + Dashboard + Analytics（Server 模式上线） | A8 + 运维 | 与 Phase 3 可交叠 |
| 5 | SEO + 评论聚合 + 友链/导航（ADR-7 JSON 化） | A7/A9 | **双线并行** |
| 6 | 设置 + 备份 + 发布流水线 + 用户/角色 | A10/A11 | **双线并行** |
| 7 | 安全加固 + 测试补齐 + 性能 + 最终验收 | A12 | 收口 |

---

## 24. 阶段验收标准（概要）

- **每 Phase 通用门**：CI 三件套 + 完整 build 绿；无前台文件变更（白名单 PR 除外）；新页面状态矩阵齐全；审计日志有记录；CONVENTIONAL commits。
- **P1**：`pnpm admin` 一键起服务；登录/登出/限速可用；DS 组件演示页（亮/暗）齐全；空白 Shell 可导航。
- **P2**：对真实仓库完成「新建→编辑→保存→git log 可见版本→预览（真实样式）→回收站→恢复」全链路；**frontmatter 往返快照测试对 9 篇既有文章零 diff**。
- **P3**：媒体上传→插入文章→LQIP 生效；分类重命名迁移正确改写全部受影响文章；动态发布与 `pnpm new-dynamic` 产物一致。
- **P4**：Umami 上线并采集到真实数据；Dashboard 五层全部真实无假数；前台 PageSpeed 无明显回退（LCP ±5% 内）。
- **P5**：友链改动经构建出现在前台；评论可从 Admin 审核删除且 Artalk 后台同步；SEO 缺失清单准确。
- **P6**：一键发布走完 Actions→rsync 全链且线上更新；备份可下载、恢复演练通过（在副本环境）；双因子角色演示通过。
- **P7**：Playwright 冒烟全绿；`pnpm audit` 无高危；最终验收 checklist（用户三十二条）逐项核对。

---

## 25. 风险清单

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | frontmatter 写回破坏既有文章（注释/格式/日期格式丢失） | 中 | 高 | 往返快照测试（9 篇真实文章）+ gray-matter 原文保留 + 写前单文件快照 |
| R2 | `slug` 幽灵字段与文件名 URL 语义混淆导致破链 | 中 | 高 | Admin 以文件名为唯一 URL 语义；重命名=显式确认流；契约文档明示 |
| R3 | 上游 Firefly 同步冲突 | 中 | 中 | Admin 全新目录隔离；前台白名单外禁改 |
| R4 | 服务器暴露 Admin 增加攻击面 | 中 | 高 | Phase 1–3 仅 Local；Server 模式叠加限速/白名单/可选 Basic 前置；CSP |
| R5 | 服务器完整构建环境缺失/构建慢 | 中 | 中 | 主路 GitHub Actions；服务器本地构建仅作降级 |
| R6 | Umami geo 达不到省级预期 | 中 | 低 | GeoLite2 City 配置；降级国家地图+排行；如实展示能力边界 |
| R7 | 定时发布语义（未来日期 + draft:false）与前台排序/feeds 表现不符 | 低 | 中 | Phase 2 实测验证；不满足则引入"隐藏直至发布时间"构建过滤（前台最小改动，需评审） |
| R8 | 加密文章（password）编辑后解密失效 | 低 | 高 | 加密往返单测；编辑器特殊模式；改密码=整文重加密确认 |
| R9 | 媒体入 Git 使仓库膨胀 | 中 | 中 | 强制 webp 转码+5MB 上限；年度归档策略；大文件引导外链 |
| R10 | Artalk API 版本差异/升级不兼容 | 低 | 低 | 代理层隔离版本适配；保留 Artalk 原生后台兜底 |
| R11 | SQLite 并发写（多管理员同时保存） | 低 | 中 | better-sqlite3 WAL + busy timeout；409 冲突检测已覆盖主场景 |
| R12 | 未提交工作区变更（当前 11 个）与 Admin git 操作互相干扰 | 高 | 中 | **Phase 1 开始前必须先提交/清理现有工作区**（列入 ROADMAP 前置任务）；server 端工作副本独立于用户本地 |
| R13 | Actions 免费额度/私库分钟数消耗 | 低 | 低 | 公开仓库免费；必要时切服务器本地构建 |
| R14 | dashboard 变成"假数据 demo" | — | 红线 | 一切数字必须来自 Umami/Artalk/Content 真实 API；A12 验收时核对抽样数据与源一致 |

---

## 26. 回滚方案

| 层 | 回滚动作 | 验证 |
|---|---|---|
| 单篇文章误改 | `POST /posts/:slug/revert`（git revert 单文件）或 undo 快照恢复 | diff 预览后执行 |
| 批量误操作 | Toast Undo（5s）+ git 单提交整体 revert + 写前快照 | 审计日志留痕 |
| 发布失败/内容错误 | Publish 页历史构建重部署（上一稳定版） | Actions 全链重跑 |
| Admin 整体下线（极端） | 服务器：停 systemd + 删 OpenResty `/admin` location；本地：`git rm -r admin server` —— **前台与内容零受影响**（全增量设计保证） | 前台全页冒烟 |
| admin.db 损坏 | 备份 `VACUUM INTO` 快照恢复；除审计日志外全部可重建 | 启动自检 |
| migration 回滚 | 每 migration 附 down 脚本，`--down` 执行 | 单测覆盖 |

---

## 27. 未来扩展路线

- **Phase 8+ 候选**：图库相册完整管理（public/gallery 上传+配置）、projects 页面增强、书签导航管理 UI、搜索分析落地、Web Mention、多作者真正启用、文章 AI 辅助（摘要/SEO 建议/翻译，走服务器端已有代理模式）、Newsletter、专题页/Landing 构建器（受控组件白名单）。
- **长期原则不变**：Markdown 真相源、前台零破坏、每一步可回滚。

---

## 附：本规划的事实依据索引

- 内容层：`src/content.config.ts`、`src/content/posts/`（9 篇）、`scripts/new-post.js`
- 路由/部署：`src/pages/**`、`astro.config.mjs`、`docs/deploy.md`、`.github/workflows/*`
- Design System：`src/styles/variables.styl`、`src/styles/main.css`、`src/config/siteConfig.ts`
- Analytics：`src/config/analyticsConfig.ts`、`src/components/analytics/UmamiAnalytics.astro`
- 评论：`src/config/commentConfig.ts`、`docs/artalk-frontend.md`
- 协作规范：`CLAUDE.md`、`AGENTS.md`、`CONTRIBUTING.md`、上级工作区 `CLAUDE.md`

> 维护者：A0（架构 Agent）。任何与本规划冲突的实现，先改规划再写代码。
