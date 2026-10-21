# Firefly Blog Admin 开发路线图（ADMIN_ROADMAP）

> 版本：v1.0 ｜ 日期：2026-10-04 ｜ 配套文档：[ADMIN_MASTER_PLAN.md](./ADMIN_MASTER_PLAN.md)
> 用法：每个 Phase 开始前，负责人 Agent 通读 MASTER PLAN + 本 Phase 条目；结束时逐条核对验收标准并在 PR 描述中引用。

---

## 全局前置条件（Phase 1 开始前必须完成）

- [ ] **清理当前工作区**：提交或暂存 11 个未提交变更（3 篇新文章、music/gallery/navBar 配置、lqips.json、daily-life-2026 相册）——Admin 的 git 操作与脏工作区会互相干扰（R12）
- [ ] 确认 Node ≥ 22.23.0 / pnpm 11 可用（现有环境已满足）
- [ ] 服务器侧预留：`/opt/firefly-admin` 目录与 systemd 权限（Phase 4 才实际部署）
- [ ] GitHub 仓库设置：`liqiming123/liqiming-blog` 创建 deploy key（写权限）与 `ADMIN_DEPLOY_SSH_KEY` secret 占位（Phase 6 使用）

---

## Phase 0 — 项目审计 + 架构设计 ✅（已完成）

| 项 | 内容 |
|---|---|
| 目标 | 摸清仓库事实，产出可执行的总体架构与路线 |
| Agent | A0 |
| 任务 | ① 全库审计（路由/内容/配置/样式/部署/安全/测试）② GitHub 成熟方案调研（Ghost/Strapi/Payload/TinaCMS/Keystatic/Umami/Decap）③ 9 条 ADR 决策 ④ 信息架构与模块清单 ⑤ Agent 分工与依赖 |
| 输入 | firefly-blog main 分支（add7484） |
| 输出 | `docs/admin/ADMIN_MASTER_PLAN.md`、`docs/admin/ADMIN_ROADMAP.md` |
| 验收 | 规划全部基于真实代码事实；每条架构决策可追溯到审计发现；用户确认 |
| 风险 | 无（纯文档） |

---

## Phase 1 — Admin Shell + Design System + Auth（地基）

| 项 | 内容 |
|---|---|
| 目标 | `pnpm admin` 一键启动本地 Admin（Local 模式）：可登录、可导航、DS 组件齐备、写操作自动进审计日志 |
| Agent | **A1**（独占：`admin/src/app/`、`admin/src/components/`、`admin/src/styles/`、`server/src/{auth,audit,index,db}/`） |
| 依赖 | Phase 0；全局前置条件 |
| 输入 | MASTER PLAN §5/§12/§18/§21；`src/styles/variables.styl`（token 源） |
| 输出 | workspace 三包结构（`.`/`admin`/`server`）；Shell 全页面骨架（含 404/403/错误页）；DS 组件库 + 演示页；登录与会话全套；SQLite + migrations 0001；审计中间件 |

### 任务分解

1. **Workspace 改造**：`pnpm-workspace.yaml` → `packages: ['.', 'admin', 'server']`；根 package.json 增加 `admin` 脚本；确认前台 `pnpm build` 零影响（CI 验证）。
2. **server 骨架**：Hono 入口（SPA 静态托管 + `/admin/api/v1` 挂载 + 全局错误体约定）；better-sqlite3 + migration 框架（含 down）；`GET /system/info` 最小实现；仅绑定 127.0.0.1。
3. **Auth**：首启引导创建管理员（argon2id）；登录/登出/改密；session 表 + HttpOnly cookie + CSRF 双提交；登录限速（IP+账号）；`GET /auth/me` 返回权限集。
4. **审计基建**：写操作中间件（module/action/target/result/detail 脱敏落库）；查询 API `GET /audit-logs`（UI 留 Phase 6，本期能查即可）。
5. **DS**：`tokens.css`（由 variables.styl 派生 + 语义扩展色）；实现 §18.4 全组件：DataTable/FilterBar/Tabs/Drawer/Modal/Toast(含 Undo)/Badge/Form/Pagination/Skeleton/Empty/ErrorPanel/403Panel/StatusBadge；`/admin/_ds` 演示页（亮/暗两色全状态展示）。
6. **Shell**：Sidebar（分组/折叠/当前态）+ Header（面包屑/主题切换/用户菜单）+ 命令面板占位；所有 §6 路由注册为骨架页（Empty 引导态）。
7. **测试**：auth 流 supertest（登录/限速/CSRF/会话过期）；Playwright 首个冒烟（登录→Shell 可见→登出）。

### 验收标准

- [ ] `pnpm install && pnpm admin` → http://127.0.0.1:4322/admin 引导建号并登录成功
- [ ] 连续错误密码 10 次锁定并产生审计记录；CSRF 缺失的写请求 403
- [ ] DS 演示页覆盖 §18.5 状态矩阵 × 亮/暗两色
- [ ] `pnpm check`+`tsc`+`biome`+`pnpm build`（前台完整 8 步）全绿且 dist 体积 diff < 1KB
- [ ] 前台 `src/**` 零文件变更

### 风险

- workspace 改造影响根包依赖提升 → 用 `pnpm install --frozen-lockfile` 于 CI 双环境验证（改 workspace 会动 lockfile，需一次受控提交）
- better-sqlite3 原生编译（ARM Mac + Linux）→ 锁版本并预编译验证

---

## Phase 2 — Content Service + 文章管理 + 编辑器 + Preview

| 项 | 内容 |
|---|---|
| 目标 | CMS 核心闭环：在 Admin 里新建/编辑/保存文章（真实写入 Markdown + git commit）、双栏编辑、真实 Firefly 样式预览、版本历史与回滚 |
| Agent | **A2**（`server/src/content/`）先行 1/3 周期出契约 → **A3**（`admin/src/modules/posts/` 列表）与 **A4**（`admin/src/modules/editor/`）**并行** |
| 依赖 | Phase 1（Auth/审计/DS） |
| 输入 | MASTER PLAN §1.2（schema 权威）、§10/§11；`scripts/new-post.js`（pinyin slug 规则）；`src/utils/crypto-utils.ts`（加密参数） |

### 任务分解

**A2 Content Service（契约先行，先发布 TS 类型 + OpenAPI）**
1. frontmatter 解析/序列化：gray-matter；**序列化必须基于原始 YAML 文本做最小 patch**（只改显式变更字段，保留既有键顺序与 `slug:` 幽灵字段）。
2. 往返保真测试：9 篇真实文章 读→写→byte-diff 为空（除显式改的字段）。
3. posts_index 同步（读取 collection → upsert 缓存；文件 mtime 校验）。
4. git 封装：`execFile git`（add/commit/log --follow/diff/revert）；commit 消息模板 `admin(posts): <动作> 《<title>》`；无 git 环境时降级"仅写文件"并警告。
5. pinyin slug 生成（复用 pinyin-pro 同参数）；文件名冲突检测。
6. 加密文章处理：Node 版加密/解密（对齐 crypto-utils 参数），编辑保存后整文重加密。
7. 草稿暂存（`.drafts/`，不入 git）+ 409 冲突检测（base hash 校验）。
8. 回收站：移动至 `src/content/_quarantine/` + 恢复。

**A3 文章管理**
- 列表页：列（标题/分类/标签/状态/发布/更新/字数/加密标记/SEO 状态）；Tabs（全部/已发布/草稿/回收站）；搜索（标题+正文）；筛选（分类/标签）；排序；分页。
- 批量操作条（选中浮出）：发布/转草稿/移回收站/批量删除/改分类/加标签（Modal 确认 + 危险项红字）。
- 行内快览 Drawer（frontmatter + 摘要 + 评论数占位）。

**A4 编辑器 + Preview**
- 三区布局 + 双栏 Markdown/预览（CodeMirror 6 + markdown-it + 前台 markdown.css Admin 引入）。
- 元数据 Drawer：§1.2 全字段表单（zod 单源校验）；封面选择（Phase 3 接媒体库，先 URL 输入）；`published` datetime；置顶/评论开关；SEO 折叠组。
- 自动保存（5s 防抖 → .drafts）+ 未保存离开拦截 + 保存状态指示（已保存/保存中/冲突）。
- 版本面板：git log 列表 + diff 视图 + 一键 revert。
- **Preview（Local 模式）**：server 以子进程启动 `astro dev`（端口 4321），把草稿写入临时文件后 iframe 渲染 `/posts/<slug>/`——真实 Firefly 样式；一键 token 防未授权访问。
- 定时发布语义实测（R7）：未来日期文章在列表/前台/feeds 的表现，报告并按需修正。

### 验收标准

- [ ] 新建文章（中文标题→拼音文件名）→ 编辑 → 保存 → `git log` 出现 admin commit → 前台 dev 可见
- [ ] **既有 9 篇文章逐篇打开→不做修改→保存：文件 byte 级零 diff**（快照测试 + 手动复核）
- [ ] 编辑加密文章：保存后前台输入原密码仍可解密（往返单测）
- [ ] 外部改动文件后 Admin 保存 → 收到 409 冲突面板
- [ ] Preview iframe 内容与前台文章页样式一致（含代码块/Callout/TOC）
- [ ] 版本历史能看到 manual 时期提交并 revert 成功
- [ ] 列表批量"移回收站"→ 前台 dev 404 → 恢复 → 复现
- [ ] A3/A4 零文件冲突（PR 记录证明并行开发）

### 风险

- YAML 最小 patch 复杂度超预期 → 允许整块重写 frontmatter 的降级方案，但必须通过 9 篇文章快照测试并保留 `slug:` 字段
- astro dev 子进程管理（端口/生命周期）→ 仅 Local 模式启用，超时自动回收

---

## Phase 3 — 动态 / 页面 / 分类标签 + 媒体库

| 项 | 内容 |
|---|---|
| 目标 | 内容面铺满：moments/pages/taxonomy CRUD + 媒体上传引用闭环 |
| Agent | **A5**（`admin/src/modules/{moments,pages,taxonomy}/`）与 **A6**（`admin/src/modules/media/` + `server/src/media/`）**双线并行** |
| 依赖 | Phase 2 的 Content Service（A2 产出） |
| 输入 | dynamic/projects/spec schema；`galleryConfig.ts`；`generate-lqips.ts`（LQIP 机制） |

### 任务分解

**A5**
- Moments：快速发布框（对齐 new-dynamic 产物：时间戳文件名 + timezone）+ 列表（置顶/删除）+ 图片粘贴。
- Pages：spec（about/friends/guestbook）与 projects 列表 + 简单编辑器（复用 A4 双栏组件的精简配置）。
- Taxonomy：分类/标签聚合视图（计数/关联文章）；**重命名分类迁移向导**（预览受影响文章清单→确认→批量改 frontmatter 单 commit）；标签合并；空标签清理。

**A6**
- 上传：拖拽/粘贴/选择；三重校验（扩展名/MIME/magic bytes）；sharp 转 webp(q85)+尺寸上限；`public/uploads/YYYY/MM/` 落盘 + media_assets 入库。
- 媒体网格：类型/日期筛选、搜索、排序、分页；详情 Drawer（全信息 + 使用位置列表）。
- 复制 URL / 插入文章（注册编辑器扩展点，A4 提供 API）。
- 批量删除（被引用阻止 + 引用清单提示）；SVG 上传默认拒绝（设置开关 + sanitize 流程说明）。
- 图库标签页：`public/gallery/**` 只读浏览 + 相册配置跳转 Settings。

### 验收标准

- [ ] Admin 发动态 → `pnpm build` 后前台 `/dynamic/` 出现（文件名/时区与 new-dynamic 一致）
- [ ] 分类重命名 → 受影响 N 篇文章 frontmatter 一次 commit 更新 → 前台归档过滤生效
- [ ] 标签合并后旧标签消失、计数正确
- [ ] 上传 4MB jpg → 自动 webp → 插入文章 → dev 预览可见 → 下次构建 LQIP 生效
- [ ] 上传 `.svg` / 改后缀的伪图片 / 6MB 文件全部被拒并给出明确错误
- [ ] 删除被文章引用的图片被阻止并列出引用文章

### 风险

- LQIP 需要完整构建才生成 → 文档明确"上传即时可见（原图）、构建后获得 LQIP"
- taxonomy 批量改写波及 feeds/日历缓存 → 迁移向导强制"重建提示"

---

## Phase 4 — Umami 部署 + Dashboard + Analytics（Server 模式上线）

| 项 | 内容 |
|---|---|
| 目标 | 真实访问统计上线：前台埋点生效，Admin Dashboard 五层真实数据，Analytics 全维度下钻 + 地理分布 |
| Agent | **A8**（`admin/src/modules/{dashboard,analytics}/`、`server/src/analytics/`、`deploy/umami/`）+ 一次运维部署 |
| 依赖 | Phase 1（Shell/Auth）；**不依赖 Phase 2/3，可在 Phase 3 期间并行启动** |
| 输入 | MASTER PLAN §13；`src/components/analytics/UmamiAnalytics.astro`（前台既有）；`analyticsConfig.ts` |

### 任务分解

1. **Umami 部署**（`deploy/umami/docker-compose.yml` + 文档）：umami + postgresql 仅内网；OpenResty `/umami/` 反代 + 访问控制（Basic Auth 或 IP 白名单）；网站建站拿 websiteId。
2. **前台启用**：`analyticsConfig.ts` 填 id/src（唯一前台变更，白名单内）——CI 体积门禁复核。
3. **server 聚合层**：Umami REST 代理（API key 环境变量）；60s 缓存；数据源离线时返回 `partial` 标记（UI 显示"未接入"卡而非假数据）。
4. **Dashboard**：五层实现（概览卡含 Content/Artalk 聚合计数；趋势图 7/30/90/自定义；热门内容含停留与趋势；访客维度；实时 10s 轮询）。
5. **Analytics 页**：分维度下钻 + 地理（GeoLite2 配置到国家级；中国省级按 R6 决策路径 a/b）；设备/Referrer/入口页。
6. **图表选型**：轻量优先（uPlot/echarts 按需异步），亮暗双色适配主题 token。

### 验收标准

- [ ] 访问前台文章 → Umami 后台与 Admin Dashboard 均出现真实事件（抽样核对三方数字一致）
- [ ] Dashboard 所有卡片可追溯到 Umami/Artalk/Content API（A8 提交数据来源对照表）
- [ ] 停掉 Umami 容器 → Dashboard 显示"统计未接入"横幅而非报错/假数
- [ ] 前台 Lighthouse/LCP 对比接入前后无显著回退（±5%）
- [ ] 地理视图不出现任何 IP 明文；默认粒度≤国家级
- [ ] Server 模式上线：`https://liqiming.top/admin/` 登录可用（HTTPS/限速/CSP 生效），systemd 托管 + 开机自启

### 风险

- GeoLite2 许可与更新 → 定时更新脚本 + 失败降级国家级
- 服务器资源（Umami+PG 约数百 MB）→ 监控磁盘/内存，预留 1G
- 公网暴露 Admin → 叠加访问控制并做一轮渗透式自查（配合 A12）

---

## Phase 5 — SEO + 评论聚合 + 友链 / 导航（含 ADR-7 前台受控变更）

| 项 | 内容 |
|---|---|
| 目标 | 运营面补全：SEO 可见可控、评论统一审核、友链/导航后台化管理 |
| Agent | **A7**（`admin/src/modules/{comments,friends,navigation}/`、`server/src/comments/`、`src/config/{friendsConfig,navBarConfig}.ts` 薄化）与 **A9**（`admin/src/modules/seo/`）**双线并行** |
| 依赖 | Phase 2（编辑器挂载点、Content Service）；Phase 4（Server 模式用于 Artalk 服务器可达性，Local 亦可直连） |
| 输入 | MASTER PLAN §3.7/§14/§15；Artalk Open API 文档；`src/types/{friendsConfig,navBarConfig}.ts` |

### 任务分解

**A7**
1. **ADR-7 落地（前台受控变更，单独 PR + 截图 + CHANGELOG-API 登记）**：友链/导航数据迁 `src/data/friends.json`、`src/data/navigation.json`；TS 配置文件变薄导入层（类型不变、前台渲染不变）；Booknav 数据一并 JSON 化。
2. 友链 CRUD + 排序（weight）+ 启用禁用；书签导航并入 Settings（标签页）。
3. 导航管理：树形编辑（增删改/拖拽排序/图标选择器（material-symbols 名单）/外链新窗）。
4. 评论代理：Artalk API（token 环境变量）→ 列表（审核/待审/垃圾 Tabs）、通过/删除/回复、黑名单；与 Artalk 原生后台操作实时一致（轮询或操作后刷新）。

**A9**
- SEO 全局设置（白名单字段写回 siteConfig）+ 按文覆盖（编辑器内已有表单，此处做汇总健康度）。
- 缺失清单（无 description/超长标题/无封面）；生成物状态页（sitemap/RSS/OG 覆盖率，数据来自最近构建回传）。
- 自动默认值逻辑文档化（空 description → 摘要；空 OG → 自动生成）。

### 验收标准

- [ ] ADR-7 PR：前台渲染逐页截图对比零差异；`pnpm build` 产物 diff 仅数据文件
- [ ] Admin 加友链 → 发布 → 前台 `/friends/` 出现且权重排序正确
- [ ] 导航增删项 → 前台导航/移动端菜单同步（含 pageKey 开关联动）
- [ ] Admin 删一条待审评论 → Artalk 原生后台同步消失；回复在文章页可见
- [ ] SEO 清单准确圈出缺 description 的文章；修复后发布清单更新

### 风险

- Artalk token 权限不足 → 部署文档列出所需最小权限
- 导航 JSON 化遗漏移动端/下拉逻辑 → 前台导航三处消费点（Navbar/移动端/预设池）逐一回归

---

## Phase 6 — Settings + Backup + Publish + Users/Audit UI

| 项 | 内容 |
|---|---|
| 目标 | 系统能力闭环：安全改配置、可备份可恢复、一键发布全链路、多用户与审计可查 |
| Agent | **A11**（`admin/src/modules/{settings,backup,publish}/`、`server/src/{settings,backup,publish}/`）与 **A10**（`admin/src/modules/{users,audit}/`、`server/src/users/`）**双线并行** |
| 依赖 | Phase 2（Content/git 基建）；Phase 4（Server 模式） |
| 输入 | MASTER PLAN §16/§17/§12；`docs/deploy.md`（服务器路径/SSH 约定）；`.github/workflows/build.yml`（复用三件套） |

### 任务分解

**A11**
1. Settings：分组标签页（基本/外观/页面开关/评论/统计/书签/图库）——**字段白名单制**（仅暴露安全字段；主题 hue、页面开关、评论开关等；每次保存走审计 + 自动触发"需重新构建"提示）。
2. Publish：新增 `admin-deploy.yml`（checkout→三件套→完整 8 步 build→SSH rsync 原子切换）；Admin 触发/轮询状态/发布历史（各步耗时、失败日志链接、重跑）；服务器本地构建降级路径（设置项）。
3. Backup：三件套备份（git bundle + VACUUM INTO + settings 导出）；列表/下载/恢复向导（校验→预览→恢复前快照→执行→失败回滚）；systemd timer 每日自动；恢复演练脚本（副本环境）。

**A10**
1. Users：列表/新建/禁用/改密/角色分配；RBAC 矩阵 UI（§12 表格）；角色差异实测（editor 账号走一遍关键接口断言 403）。
2. Audit UI：查询（时间/人/模块/结果）+ 详情（字段级 diff 摘要）；敏感信息确认脱敏（password/正文不出现）。

### 验收标准

- [ ] Admin 改站点标题/hue → 一键发布 → 线上前台生效（全链 8 步日志可视）
- [ ] 发布失败注入（故意写错 frontmatter）→ Actions 红 → Admin 展示失败并定位到 astro check 报错；线上仍为旧版（原子性）
- [ ] 备份下载 → 副本环境恢复 → 内容/设置/审计一致；恢复过程中断 → 回滚到恢复前状态
- [ ] editor 角色登录：可编辑文章、保存/发布按钮对"他人文章"服务端 403（抓包验证，非仅 UI 隐藏）
- [ ] 全部 Phase 1–5 的写操作在审计 UI 可检索、diff 摘要可读

### 风险

- SSH deploy key 权限过宽 → 限定单仓库写；secrets 清单审计
- rsync 原子切换与 OpenResty cache → 灰度验证一次后固化脚本

---

## Phase 7 — 安全加固 + 测试补齐 + 性能 + 最终验收

| 项 | 内容 |
|---|---|
| 目标 | 达到"真正上线使用的 Blog CMS"标准，通过最终验收清单 |
| Agent | **A12**（`admin/tests/`、`server/tests/`、`.github/workflows/admin-*.yml`）+ 全体 Agent 配合修复 |
| 依赖 | Phase 1–6 全部合入 develop |
| 输入 | MASTER PLAN §20/§21/§22/§24；用户最终验收标准（原文三十二条） |

### 任务分解

1. Playwright 全链 E2E（登录→建文→编辑→预览→发布→线上可见；媒体；评论审核；备份恢复）+ Shell 视觉回归（亮/暗）。
2. 安全自查清单执行：CSRF/限速/上传三重校验/CSP/权限抽查（每模块至少 1 个越权用例）/`pnpm audit --prod` 高危清零/密钥扫描（gitleaks 类）。
3. 性能门禁：前台 dist 体积与 LCP 对比基线（Phase 0 存量快照）；Admin SPA 分包审计；Dashboard 大时间范围加载测试。
4. 文档收口：`docs/admin/` 补齐部署手册（Server 模式 systemd/OpenResty/Umami/备份恢复）+ API CHANGELOG 定稿。
5. 最终验收 checklist 逐项核对并在 ROADMAP 附执行记录。

### 验收标准（= 用户最终验收对照）

- [ ] 前台完全正常：原 9+3 篇文章无丢失、无 frontmatter 污染、主题视觉零变化
- [ ] Admin 登录/权限/全 CRUD/编辑器/Preview/媒体可用
- [ ] Dashboard 与 Analytics 数字与 Umami/Artalk 后台抽样一致（真实数据）
- [ ] SEO 可控、备份可用、发布链路明确可回滚
- [ ] 全模块 Loading/Empty/Error/Success/Disabled/403 状态齐全；手机端核心操作（登录/文章/发布）可用
- [ ] `pnpm build`（8 步）+ 三件套 + admin/server typecheck/lint/test 全绿；无新增 TS 错误；前台性能无回退

---

## Phase 8+ — 扩展池（不排期，按需立项）

搜索分析落地（事件采集）｜图库完整管理｜书签 UI｜多作者实测启用｜AI 辅助写作（摘要/SEO/翻译，走服务器代理模式）｜Newsletter｜专题页构建器｜Web Mention

---

## 附：Agent × Phase 矩阵

| Agent | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---|---|---|---|---|---|---|---|
| A0 架构 | ✅ | 评审 | 评审 | 评审 | 评审 | 评审 | 评审 | 评审 |
| A1 Shell/DS/Auth | | ✅ | 支持 | 支持 | 支持 | 支持 | 支持 | 修复 |
| A2 Content | | | ✅ | 支持 | | | 支持 | 修复 |
| A3 文章列表 | | | ✅ | | | | | 修复 |
| A4 编辑器 | | | ✅ | 挂载点 | | | | 修复 |
| A5 页面/动态/分类 | | | | ✅ | | | | 修复 |
| A6 媒体 | | | | ✅ | | | | 修复 |
| A7 评论/友链/导航 | | | | | | ✅ | | 修复 |
| A8 Analytics | | | | | ✅ | | | 修复 |
| A9 SEO | | | | | | ✅ | | 修复 |
| A10 用户/审计 | | | | | | | ✅ | 修复 |
| A11 设置/备份/发布 | | | | | | | ✅ | 修复 |
| A12 质量总验 | | 冒烟 | 抽查 | 抽查 | 抽查 | 抽查 | 抽查 | ✅ |

> 变更本路线须先更新 `ADMIN_MASTER_PLAN.md` 对应章节（A0 职责）。
