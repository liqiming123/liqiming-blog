// ─────────────────────────────────────────────────────────────
// aurora 协议适配层：让 aurora 管理前端（原样照搬的布局）直接读写本站数据。
// 响应一律 {flag, code, message, data}；token 沿用本站 session（Bearer）。
// 数据源：src/content/posts、src/content/dynamic、src/data/gallery.json、
//         public/gallery、SQLite(users/sessions/audit/自建统计)。
// ─────────────────────────────────────────────────────────────
import { Hono } from "hono";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pinyin } from "pinyin-pro";
import { db, getMeta, setMeta, today } from "./db.js";
import { scanPosts } from "./posts.js";
import { listComments, replyComment, updateComment, deleteComment, pendingCount, totalComments, getNotifyState, setNotifyState, artalkStats, artalkMembers, setArtalkAdmin } from "./artalk.js";
import { hashPassword, verifyPassword } from "./auth-helpers.js";
import { audit as auditRaw } from "./auth.js";
import { triggerBuild } from "./build-runner.js";
import { lookupArea } from "./ipregion.js";
import menuTree from "./aurora-menu.js";

// 日志管理页要展示「登录IP/请求方式」：包装 audit 自动从 Hono context 提取，
// 53 处调用点统一经由此函数（非请求上下文调用请直接用 auditRaw）
const audit = (
	c: any,
	userId: number | null,
	module: string,
	action: string,
	target: string,
	result: string,
	detail = "",
) =>
	auditRaw(userId, module, action, target, result, detail, {
		ip: (c?.req?.header("x-forwarded-for") || "").split(",")[0].trim(),
		method: c?.req?.method || "",
	});

const __dirname = dirname(fileURLToPath(import.meta.url));
// 线上部署时 BLOG_ROOT 指向服务器上的博客内容镜像
const BLOG_ROOT = process.env.BLOG_ROOT || resolve(__dirname, "../../");
const POSTS_DIR = join(BLOG_ROOT, "src/content/posts");
const DYNAMIC_DIR = join(BLOG_ROOT, "src/content/dynamic");
const QUARANTINE_DIR = join(BLOG_ROOT, "src/content/_quarantine");
const GALLERY_JSON = join(BLOG_ROOT, "src/data/gallery.json");
const GALLERY_DIR = join(BLOG_ROOT, "public/gallery");
const UPLOADS_DIR = join(BLOG_ROOT, "public/uploads");
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

export const auroraRouter = new Hono<any>();

// ── 线上只读门：CONTENT_MODE=readonly 时，内容类写接口返回提示（数据可看不可改）──
const READONLY = process.env.CONTENT_MODE === "readonly";
const CONTENT_WRITE_RE = /^\/api\/(admin\/(articles|talks|photos|albums|links|categories|tags)(\/|$)|upload)/;
auroraRouter.use("*", async (c, next) => {
	if (READONLY && c.req.method !== "GET" && CONTENT_WRITE_RE.test(c.req.path)) {
		return c.json(fail(500, "线上内容写入将在发布管线（Phase 6）接入后开放，当前仅本地开发模式可写"), 200);
	}
	return next();
});


const ok = (data: any = null, message = "操作成功") => ({ flag: true, code: 20000, message, data });
const fail = (code: number, message: string) => ({ flag: false, code, message, data: null });

// 稳定短 id：slug → 数字（编辑/删除用 id 寻址）
const hashId = (s: string): number => {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
	return h % 2_000_000_000;
};

const page = (c: any) => ({
	current: Math.max(1, Number(c.req.query("current") || 1)),
	size: Math.max(1, Number(c.req.query("size") || 10)),
});
const paged = (rows: any[], current: number, size: number) => ({
	records: rows.slice((current - 1) * size, current * size),
	count: rows.length,
});

const me = (c: any) => c.get("user") as { id: number; username: string; nickname: string; role: string } | undefined;
// 删除类接口的 id 解析：前端 axios 会把数组作为裸 JSON body 发出（{data: ids}），
// 这里同时兼容裸数组 / {idList} / {ids} / {id} 四种形态
const idListOf = (body: any): number[] =>
	Array.isArray(body)
		? body.map(Number).filter((n) => !Number.isNaN(n))
		: body.idList || body.ids || (body.id ? [body.id] : []);
const requireLogin = (c: any) => {
	if (!me(c)) return fail(40001, "未登录");
	return null;
};

// ══════════ 认证 ══════════

// ── 登录邮箱验证码：账密正确后把 6 位码发到站长 QQ 邮箱（SMTP 复用 Artalk 同款配置）──
import nodemailer from "nodemailer";

const SMTP = {
	host: process.env.SMTP_HOST || "",
	port: Number(process.env.SMTP_PORT || 587),
	user: process.env.SMTP_USER || "",
	pass: process.env.SMTP_PASS || "",
	to: process.env.ADMIN_CODE_MAILTO || "",
};
const mailer = SMTP.host
	? nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, auth: { user: SMTP.user, pass: SMTP.pass } })
	: null;
// 用户名 → {code, expires, sentAt}；60s 限频，10 分钟有效
const loginCodes = new Map<string, { code: string; expires: number; sentAt: number }>();

const verifyAccount = (username: string, password: string) => {
	const user = db
		.prepare("SELECT id, username, nickname, role, password_hash FROM users WHERE username = ?")
		.get(username) as any;
	if (!user || !verifyPassword(password, user)) return null;
	return user;
};

auroraRouter.post("/api/users/login-code", async (c) => {
	applyCors(c);
	const body = await c.req.json().catch(() => ({}));
	const username = String(body.username || "");
	const password = String(body.password || "");
	const user = verifyAccount(username, password);
	if (!user) {
		audit(c, null, "aurora-auth", "login-code", username, "fail(账密错误)");
		return c.json(fail(500, "账号或密码错误，验证码未发送"), 200);
	}
	const last = loginCodes.get(username);
	if (last && Date.now() - last.sentAt < 60_000) {
		return c.json(fail(500, "发送太频繁，请 1 分钟后再试"), 200);
	}
	if (!mailer) return c.json(fail(500, "邮件服务未配置（缺少 SMTP 环境变量）"), 200);
	const code = String(Math.floor(100000 + Math.random() * 900000));
	try {
		await mailer.sendMail({
			from: `"Firefly Admin" <${SMTP.user}>`,
			to: SMTP.to,
			subject: `管理后台登录验证码：${code}`,
			text: `账号 ${username} 正在登录管理后台。\n\n验证码：${code}\n\n10 分钟内有效。若非本人操作，请立即修改密码。`,
		});
	} catch (e) {
		audit(c, user.id, "aurora-auth", "login-code", username, "mail-fail");
		return c.json(fail(500, "验证码邮件发送失败：" + String(e).slice(0, 80)), 200);
	}
	loginCodes.set(username, { code, expires: Date.now() + 10 * 60_000, sentAt: Date.now() });
	audit(c, user.id, "aurora-auth", "login-code", username, "sent");
	// DEBUG_CODE=1 时把码打进日志，便于联调；生产勿开
	console.log(`[login-code] ${username} 的验证码已发送至 ${SMTP.to}${process.env.DEBUG_CODE ? "（DEBUG_CODE：" + code + "）" : ""}`);
	return c.json(ok(null, `验证码已发送到 ${SMTP.to}，10 分钟内有效`));
});

// ── 前台跨域 CORS：博客(4321/liqiming.top)调登录/注册/用户信息 ──
const FRONT_ORIGINS = new Set([
  'http://localhost:4321', 'http://127.0.0.1:4321',
  'https://liqiming.top', 'https://www.liqiming.top',
]);
const applyCors = (c: any) => {
  const origin = c.req.header('origin') || '';
  if (!FRONT_ORIGINS.has(origin)) return;
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Headers', 'content-type, authorization');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Max-Age', '86400');
  c.header('Vary', 'Origin');
};
auroraRouter.options('/api/users/*', (c) => { applyCors(c); return c.body(null, 204); });


auroraRouter.post("/api/users/login", async (c) => {
	applyCors(c);
	const form = await c.req.parseBody().catch(() => ({} as any));
	const username = String(form.username || "");
	const password = String(form.password || "");
	const user = verifyAccount(username, password);
	if (!user) {
		audit(c, null, "aurora-auth", "login", username, "fail");
		return c.json(fail(500, "用户名或密码错误"), 200);
	}
	// 邮箱验证码二次校验：码发到站长邮箱，10 分钟内有效
	if (mailer) {
		const pending = loginCodes.get(username);
		const submitted = String(form.code || "");
		if (!pending || pending.expires < Date.now() || submitted !== pending.code) {
			audit(c, user.id, "aurora-auth", "login", username, "fail(验证码错误)");
			return c.json(fail(500, "邮箱验证码错误或已过期，请先获取验证码"), 200);
		}
		loginCodes.delete(username);
	}
	const token = await import("./auth-helpers.js").then((m) => m.createSessionFor(user.id, c.req.header("user-agent") || ""));
	const info = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as any;
	audit(c, user.id, "aurora-auth", "login", username, "ok");
	return c.json(
		ok({
			id: user.id, userInfoId: user.id, username: user.username, nickname: user.nickname || user.username,
			avatar: info.avatar || "", intro: info.intro || "", email: info.email || user.username,
			loginType: 1, ipAddress: "127.0.0.1", ipSource: "本地", isSubscribe: 0, website: "", role: user.role,
			lastLoginTime: new Date().toISOString().slice(0, 19), token,
		}),
	);
});

// 注册：aurora 原版没有注册表单，这里给登录页新加的注册 Tab 用；本地演示不需要邮箱验证码
auroraRouter.post("/api/users/register", async (c) => {
	applyCors(c);
	const body = await c.req.json().catch(() => ({}));
	const username = String(body.username || "").trim();
	const password = String(body.password || "");
	const nickname = String(body.nickname || username).trim();
	if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) return c.json(fail(500, "用户名已存在"), 200);
	if (/^\d{5,12}$/.test(username)) {
		const pending = pendingCodes.get(username);
		if (!pending || pending.expires < Date.now() || String(body.code || "") !== pending.code) {
			return c.json(fail(500, "验证码错误或已过期，请先获取验证码"), 200);
		}
		pendingCodes.delete(username);
	}
	const info = db
		.prepare("INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, 'user')")
		.run(username, hashPassword(password), nickname);
	const token = await import("./auth-helpers.js").then((m) => m.createSessionFor(Number(info.lastInsertRowid), c.req.header("user-agent") || ""));
	audit(c, Number(info.lastInsertRowid), "aurora-auth", "register", username, "ok");
	return c.json(ok({ token, nickname, username }, "注册成功"));
});


// 前台用：Bearer 查当前登录用户（弹窗初始化/校验）
auroraRouter.get('/api/users/me', (c) => {
	applyCors(c);
	const u = me(c);
	if (!u) return c.json(fail(40001, '未登录'), 200);
	const info = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id) as any;
	return c.json(ok({ id: u.id, nickname: info.nickname || info.username, username: info.username, role: u.role, avatar: info.avatar || '', email: info.email || '' }));
});

// QQ 注册验证码：按账号生成 6 位码，10 分钟有效。
// 本地演示直接把码放在 message 里回显；接 SMTP 后改为发到 QQ 邮箱并从响应中移除。
const pendingCodes = new Map<string, { code: string; expires: number }>();
auroraRouter.post("/api/users/qq-code", async (c) => {
	applyCors(c);
	const body = await c.req.json().catch(() => ({}));
	const account = String(body.username || "").trim();
	if (!account) return c.json(fail(500, "请先输入账号"), 200);
	const code = String(Math.floor(100000 + Math.random() * 900000));
	pendingCodes.set(account, { code, expires: Date.now() + 10 * 60 * 1000 });
	return c.json(ok(null, "验证码已生成（本地演示直接显示）：" + code));
});

auroraRouter.get("/api/users/code", (c) => c.json(ok(123456, "验证码请通过登录邮箱验证码流程获取")));
auroraRouter.post("/api/users/refresh", (c) => {
	return me(c) ? ok({ token: c.get("sessionToken") }) : fail(40001, "未登录");
});
auroraRouter.post("/api/users/logout", (c) => {
	applyCors(c);
	const token = c.get("sessionToken");
	if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
	audit(c, me(c)?.id ?? null, "aurora-auth", "logout", me(c)?.username ?? "", "ok");
	return c.json(ok());
});

// ── 前台评论区身份 → 后台管理员绑定 ──
// 前台导航「管理」入口仅对"在评论区用管理员邮箱登录"的用户显示：
// 拿 Artalk 登录 token 调 Artalk 权威接口换身份，邮箱与后台 admin 账号一致时
// 签发后台 session（前台入口凭它免登直通）；游客/普通评论用户一律 admin:false。
const ARTALK_API = process.env.ARTALK_BASE_URL || "";
const atkSessionHits = new Map<string, number[]>();
auroraRouter.post("/api/users/artalk-session", async (c) => {
	applyCors(c);
	const ip = (c.req.header("x-forwarded-for") || "").split(",")[0].trim() || "local";
	const now = Date.now();
	const hits = (atkSessionHits.get(ip) ?? []).filter((t) => now - t < 60_000);
	if (hits.length >= 10) return c.json(fail(500, "请求过于频繁，请稍后再试"), 200);
	hits.push(now);
	atkSessionHits.set(ip, hits);

	const body = await c.req.json().catch(() => ({}));
	const token = String(body.token || "");
	if (!token || !/^[A-Za-z0-9._-]+$/.test(token)) return c.json(ok({ admin: false }));
	if (!ARTALK_API) return c.json(fail(500, "评论服务未配置（缺少 ARTALK_BASE_URL）"), 200);

	// 用户 token 直接问 Artalk（不能带 bot 凭据）；Artalk 响应是顶层 {user, is_login}，多层兜底防版本差异
	let atkUser: any = null;
	try {
		const res = await fetch(`${ARTALK_API}/api/v2/user`, {
			headers: { authorization: `Bearer ${token}` },
		});
		if (res.ok) {
			const env = (await res.json().catch(() => null)) as any;
			atkUser = env?.data?.user ?? env?.data ?? env?.user ?? null;
		}
	} catch {
		/* Artalk 不可达按非管理员处理 */
	}
	if (!atkUser?.email) return c.json(ok({ admin: false }));

	const email = String(atkUser.email).toLowerCase();
	const admins = db.prepare("SELECT id, username, nickname, email FROM users WHERE role = 'admin'").all() as any[];
	const matched = admins.find(
		(u) => String(u.username).toLowerCase() === email || String(u.email || "").toLowerCase() === email,
	);
	if (!matched) return c.json(ok({ admin: false }));

	const session = await import("./auth-helpers.js").then((m) =>
		m.createSessionFor(matched.id, c.req.header("user-agent") || ""),
	);
	audit(c, matched.id, "aurora-auth", "artalk-session", atkUser.email, "admin-ok");
	return c.json(ok({ admin: true, nickname: matched.nickname || matched.username, token: session }));
});

auroraRouter.get("/api/admin/users/info", (c) => {
	const u = me(c)!;
	const info = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id) as any;
	return c.json(
		ok({
			id: u.id, userInfoId: u.id, username: info.username, nickname: info.nickname || info.username,
			avatar: info.avatar || "", intro: info.intro || "", email: info.email || "", website: "",
			loginType: 1, lastLoginTime: new Date().toISOString().slice(0, 19),
		}),
	);
});

auroraRouter.put("/api/users/info", async (c) => {
	applyCors(c);
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	if (body.nickname !== undefined) db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(String(body.nickname), u.id);
	if (body.intro !== undefined) db.prepare("UPDATE users SET intro = ? WHERE id = ?").run(String(body.intro), u.id);
	audit(c, u.id, "aurora-user", "update-info", u.username, "ok");
	return c.json(ok());
});

auroraRouter.put("/api/users/password", async (c) => {
	applyCors(c);
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	// verifyPassword 第二参是用户对象（内部读 password_hash），不能只传哈希字符串
	const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(u.id) as any;
	if (!verifyPassword(String(body.oldPassword ?? body.password ?? ""), row))
		return c.json(fail(500, "原密码不正确"), 200);
	db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(String(body.newPassword ?? body.password ?? "")), u.id);
	audit(c, u.id, "aurora-user", "change-password", u.username, "ok");
	return c.json(ok());
});

// ══════════ 菜单 / RBAC（轻量固定模型：admin/user 两角色）══════════
auroraRouter.get("/api/admin/user/menus", (c) => (me(c) ? c.json(ok(menuTree)) : c.json(fail(40001, "未登录"), 200)));
auroraRouter.get("/api/admin/menus", (c) => c.json(ok(menuTree)));
auroraRouter.get("/api/admin/role/menus", (c) => c.json(ok(menuTree)));
auroraRouter.get("/api/admin/roles", (c) => {
	// 真实角色概览：站长（后台）+ Artalk 评论管理员/评论用户，各带人数
	const members = artalkMembers();
	const adminCount = (db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get() as any).n;
	const roles = [
		{ id: 1, roleName: "站长", roleNameZh: "站长", isDisable: 0, description: `后台管理员，全部权限（${adminCount} 人）`, createTime: "" },
		{ id: 3, roleName: "评论管理员", roleNameZh: "评论管理员", isDisable: 0, description: `Artalk 评论区管理员，可管理评论（${members.filter((m) => m.is_admin).length} 人）`, createTime: "" },
		{ id: 4, roleName: "评论用户", roleNameZh: "评论用户", isDisable: 0, description: `评论区注册用户，可评论与接收回复通知（${members.filter((m) => !m.is_admin).length} 人）`, createTime: "" },
	];
	return c.json(ok({ records: roles, count: roles.length }));
});
// Artalk 成员表（角色管理页）：切换评论管理员身份走 PUT /api/admin/users/role（source=artalk）
auroraRouter.get("/api/admin/artalk-members", (c) => {
	if (!me(c)) return c.json(fail(40001, "未登录"), 200);
	return c.json(ok({ records: artalkMembers(), count: artalkMembers().length }));
});
auroraRouter.get("/api/admin/roles/all", (c) =>
	c.json(ok([{ id: 1, roleName: "站长" }, { id: 3, roleName: "评论管理员" }, { id: 4, roleName: "评论用户" }])),
);
auroraRouter.post("/api/admin/role", (c) => c.json(ok(null, "当前为轻量角色模型，角色不可编辑")));
auroraRouter.delete("/api/admin/roles/:id", (c) => c.json(ok(null, "内置角色不可删除")));
auroraRouter.post("/api/admin/menus", (c) => c.json(ok(null, "菜单为固定树，暂不支持在线编辑")));
auroraRouter.delete("/api/admin/menus/:id", (c) => c.json(ok()));
auroraRouter.put("/api/admin/menus/hidden", (c) => c.json(ok()));
auroraRouter.put("/api/admin/menus/sort", (c) => c.json(ok()));

// ══════════ 仪表盘（自建统计 + 内容扫描）══════════
const dateRange = (days: number) => {
	const out: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
	}
	return out;
};

const postViews = (): Map<string, number> => {
	const rows = db.prepare("SELECT path, SUM(views) v FROM page_views WHERE path LIKE '/posts/%' GROUP BY path").all() as any[];
	return new Map(rows.map((r) => [r.path, r.v]));
};

auroraRouter.get("/api/admin", (c) => {
	if (!me(c)) return c.json(fail(40001, "未登录"), 200);
	const posts = scanPosts();
	const views = postViews();
	const catMap = new Map<string, number>();
	const tagMap = new Map<string, number>();
	for (const p of posts) {
		catMap.set(p.category, (catMap.get(p.category) ?? 0) + 1);
		for (const t of p.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
	}
	const range = dateRange(7);
	const uvRows = db.prepare(`SELECT date, COUNT(*) v FROM daily_visitors WHERE date IN (${range.map(() => "?").join(",")}) GROUP BY date`).all(...range) as any[];
	const uvMap = new Map(uvRows.map((r) => [r.date, r.v]));
	const top = [...views.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
	// 用户量 = 后台账号 + Artalk 注册用户；留言量 = Artalk 真实评论数（不再拿审计日志行数顶）
	const atk = artalkStats();
	return c.json(
		ok({
			viewsCount: Number(getMeta("total_views") || 0),
			userCount: (db.prepare("SELECT COUNT(*) n FROM users").get() as any).n + atk.users,
			articleCount: posts.length,
			messageCount: atk.comments,
			uniqueViewDTOs: range.map((d) => ({ day: d.slice(5), viewsCount: uvMap.get(d) ?? 0 })),
			articleRankDTOs: top.map(([path, v]) => {
				const post = posts.find((p) => `/posts/${p.slug}/` === path);
				// id 必须与详情接口一致（hashId(slug)），否则星榜点击进编辑页会“文章不存在”
				const slug = path.replace(/^\/posts\//, "").replace(/\/$/, "");
				return { id: hashId(slug), articleTitle: post?.title ?? path, viewsCount: v, createTime: post?.pubDate ?? "" };
			}),
			categoryDTOs: [...catMap.entries()].map(([name, n]) => ({ id: hashId(name), categoryName: name, articleCount: n })),
			tagDTOs: [...tagMap.entries()].map(([name, n]) => ({ id: hashId(name), tagName: name, count: n })),
		}),
	);
});

auroraRouter.get("/api/admin/users/area", (c) => {
	const rows = db.prepare("SELECT area name, SUM(count) value FROM visitor_areas GROUP BY area ORDER BY value DESC").all();
	return c.json(ok(rows));
});

// ══════════ 文章（src/content/posts）══════════
const slugify = (title: string) => {
	const py = pinyin(title, { toneType: "none", type: "array", nonZh: "consecutive" })
		.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
	return /^[a-zA-Z0-9_-]{1,64}$/.test(py) ? py : `post-${Date.now()}`;
};

const articleRow = (p: any, views: Map<string, number>) => ({
	id: hashId(p.slug),
	articleTitle: p.title,
	categoryName: p.category,
	tagNameList: p.tags,
	createTime: p.pubDate,
	updateTime: p.pubDate,
	viewsCount: views.get(`/posts/${p.slug}/`) ?? 0,
	type: 1,
	status: p.draft ? 3 : p.password ? 2 : 1,
	isTop: 0,
	isFeatured: 0,
	isDelete: 0,
	articleCover: "",
	articleAbstract: "",
});

const findPostById = (id: number) => {
	const posts = scanPosts();
	const p = posts.find((x) => hashId(x.slug) === Number(id));
	if (!p) return null;
	const raw = readFileSync(join(POSTS_DIR, `${p.slug}.md`), "utf8");
	const { data, content } = matter(raw);
	return { p, data, content, file: join(POSTS_DIR, `${p.slug}.md`) };
};

auroraRouter.get("/api/admin/articles", (c) => {
	const p = page(c);
	const keywords = (c.req.query("keywords") || "").toLowerCase();
	const views = postViews();
	let rows = scanPosts().map((x) => articleRow(x, views));
	if (keywords) rows = rows.filter((r) => r.articleTitle.toLowerCase().includes(keywords));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.get("/api/admin/articles/search", (c) => {
	const p = page(c);
	const keywords = (c.req.query("keywords") || "").toLowerCase();
	const views = postViews();
	const rows = scanPosts().filter((x) => x.title.toLowerCase().includes(keywords)).map((x) => articleRow(x, views));
	return c.json(ok(paged(rows, p.current, p.size)));
});

auroraRouter.get("/api/admin/articles/:id", (c) => {
	const found = findPostById(c.req.param("id"));
	if (!found) return c.json(fail(500, "文章不存在"), 200);
	return c.json(
		ok({
			id: hashId(found.p.slug),
			articleTitle: found.data.title ?? found.p.title,
			articleContent: found.content,
			articleAbstract: found.data.description ?? "",
			articleCover: found.data.image ?? "",
			categoryName: found.data.category ?? "",
			tagNames: Array.isArray(found.data.tags) ? found.data.tags : [],
			isTop: found.data.pinned ? 1 : 0,
			isFeatured: 0,
			type: 1,
			status: found.data.draft ? 3 : 1,
			originalUrl: found.data.sourceLink ?? "",
			password: "",
			createTime: found.p.pubDate,
		}),
	);
});

auroraRouter.post("/api/admin/articles", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));

	if (body.id) {
		const found = findPostById(body.id);
		if (!found) return c.json(fail(500, "文章不存在"), 200);
		if (found.data.password) return c.json(fail(500, "加密文章暂不支持在线编辑"), 200);
		const merged: any = { ...found.data };
		if (body.articleTitle !== undefined) merged.title = String(body.articleTitle);
		if (body.categoryName !== undefined) merged.category = String(body.categoryName || "");
		if (body.tagNames !== undefined) merged.tags = body.tagNames;
		if (body.articleAbstract !== undefined) merged.description = String(body.articleAbstract || "");
		if (body.articleCover) merged.image = String(body.articleCover);
		if (body.isTop !== undefined) merged.pinned = Boolean(body.isTop);
		if (body.status !== undefined) merged.draft = Number(body.status) === 3;
		if (typeof merged.published === "string") merged.published = new Date(merged.published);
		const content = body.articleContent !== undefined ? String(body.articleContent) : found.content;
		writeFileSync(found.file, matter.stringify(content, merged));
		audit(c, u.id, "aurora-article", "update", found.p.slug, "ok");
				triggerBuild("content-write");
		return c.json(ok(null, "更新成功"));
	}

	const title = String(body.articleTitle || "").trim();
	const content = String(body.articleContent || "");
	if (!title || !content) return c.json(fail(500, "标题与正文必填"), 200);
	const slug = slugify(title);
	const file = join(POSTS_DIR, `${slug}.md`);
	if (existsSync(file)) return c.json(fail(500, `文件 ${slug}.md 已存在`), 200);
	const data: any = { title, published: new Date() };
	if (body.categoryName) data.category = String(body.categoryName);
	if (Array.isArray(body.tagNames) && body.tagNames.length) data.tags = body.tagNames;
	if (body.articleAbstract) data.description = String(body.articleAbstract);
	if (body.articleCover) data.image = String(body.articleCover);
	if (body.isTop) data.pinned = true;
	if (Number(body.status) === 3) data.draft = true;
	if (body.password) data.password = String(body.password);
	writeFileSync(file, matter.stringify(content, data));
	audit(c, u.id, "aurora-article", "create", slug, "ok");
				triggerBuild("content-write");
	return c.json(ok(null, `已创建 ${slug}.md`));
});

auroraRouter.put("/api/admin/articles/status", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const found = findPostById(body.id);
	if (!found) return c.json(fail(500, "文章不存在"), 200);
	const merged: any = { ...found.data };
	merged.draft = Number(body.status) === 3;
	if (typeof merged.published === "string") merged.published = new Date(merged.published);
	writeFileSync(found.file, matter.stringify(found.content, merged));
	audit(c, u.id, "aurora-article", "status", found.p.slug, String(body.status));
				triggerBuild("content-write");
	return c.json(ok());
});

auroraRouter.put("/api/admin/articles/topAndFeatured", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const found = findPostById(body.id);
	if (!found) return c.json(fail(500, "文章不存在"), 200);
	const merged: any = { ...found.data };
	merged.pinned = Boolean(body.isTop);
	if (typeof merged.published === "string") merged.published = new Date(merged.published);
	writeFileSync(found.file, matter.stringify(found.content, merged));
	audit(c, u.id, "aurora-article", "top", found.p.slug, String(body.isTop));
				triggerBuild("content-write");
	return c.json(ok());
});

auroraRouter.delete("/api/admin/articles/delete", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	mkdirSync(QUARANTINE_DIR, { recursive: true });
	let n = 0;
	for (const id of ids) {
		const found = findPostById(id);
		if (!found) continue;
		renameSync(found.file, join(QUARANTINE_DIR, `${found.p.slug}.md`));
		n += 1;
	}
	audit(c, u.id, "aurora-article", "delete", ids.join(","), `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok(null, `已移入回收站 ${n} 篇`));
});

auroraRouter.post("/api/admin/articles/import", async (c) => {
	const u = me(c)!;
	const body = await c.req.parseBody({ all: true });
	const files = (Array.isArray(body.files) ? body.files : [body.files]).filter((f: any) => f instanceof File);
	let n = 0;
	for (const f of files as File[]) {
		if (!f.name.endsWith(".md")) continue;
		const raw = await f.text();
		const { data, content } = matter(raw);
		const title = String(data.title || f.name.replace(/\.md$/, ""));
		const slug = slugify(title);
		const file = join(POSTS_DIR, `${slug}.md`);
		if (existsSync(file)) continue;
		writeFileSync(file, matter.stringify(content, { ...data, title, draft: true, published: data.published ? new Date(data.published) : new Date() }));
		n += 1;
	}
	audit(c, u.id, "aurora-article", "import", "", `ok(${n})`);
	return c.json(ok(null, `导入 ${n} 篇为草稿`));
});

auroraRouter.post("/api/admin/articles/export", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => []);
	const ids: number[] = Array.isArray(body) ? body : [];
	const posts = scanPosts();
	const picked = ids.length ? posts.filter((p) => ids.includes(hashId(p.slug))) : posts;
	mkdirSync(join(UPLOADS_DIR, "exports"), { recursive: true });
	const stamp = Date.now();
	const urls: string[] = [];
	for (const p of picked) {
		const dest = join(UPLOADS_DIR, "exports", `${stamp}-${p.slug}.md`);
		writeFileSync(dest, readFileSync(join(POSTS_DIR, `${p.slug}.md`)));
		urls.push(`/uploads/exports/${stamp}-${p.slug}.md`);
	}
	audit(c, u.id, "aurora-article", "export", "", `ok(${urls.length})`);
	return c.json(ok(urls));
});

auroraRouter.post("/api/admin/articles/images", async (c) => {
	const u = me(c)!;
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	const url = await saveUpload(file, "");
	audit(c, u.id, "aurora-article", "upload-image", url, "ok");
	return c.json(ok(url));
});

// ══════════ 分类 / 标签（由文章派生；重命名 = 批量改 frontmatter）══════════
// 后台直接添加的预注册名（taxonomies 表）：未被文章引用时 count=0 展示，发文时可选
const presetNames = (kind: "tag" | "category"): string[] =>
	(db.prepare("SELECT name FROM taxonomies WHERE kind = ?").all(kind) as { name: string }[]).map((r) => r.name);
auroraRouter.get("/api/admin/categories", (c) => {
	const p = page(c);
	const map = new Map<string, number>();
	for (const post of scanPosts()) map.set(post.category, (map.get(post.category) ?? 0) + 1);
	for (const name of presetNames("category")) if (!map.has(name)) map.set(name, 0);
	const rows = [...map.entries()].map(([name, n]) => ({ id: hashId(name), categoryName: name, articleCount: n, createTime: "" }));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.get("/api/admin/categories/search", (c) => {
	const kw = (c.req.query("keywords") || "").toLowerCase();
	const map = new Map<string, number>();
	for (const post of scanPosts()) map.set(post.category, (map.get(post.category) ?? 0) + 1);
	for (const name of presetNames("category")) if (!map.has(name)) map.set(name, 0);
	return c.json(ok([...map.entries()].filter(([n]) => n.toLowerCase().includes(kw)).map(([n, c2]) => ({ id: hashId(n), categoryName: n, articleCount: c2 }))));
});
auroraRouter.get("/api/admin/categories/all", (c) => {
	const set = new Set<string>(scanPosts().map((p) => p.category));
	for (const name of presetNames("category")) set.add(name);
	return c.json(ok([...set].map((n) => ({ id: hashId(n), categoryName: n }))));
});
auroraRouter.post("/api/admin/categories", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const newName = String(body.categoryName || "").trim();
	if (!newName) return c.json(fail(500, "名称不能为空"), 200);
	if (body.id) {
		// 重命名：找出旧名（hashId 反查）并批量改写文章 frontmatter
		const oldName = [...new Set(scanPosts().map((p) => p.category))].find((n) => hashId(n) === Number(body.id));
		if (!oldName) return c.json(fail(500, "分类不存在"), 200);
		let n = 0;
		for (const post of scanPosts().filter((p) => p.category === oldName)) {
			const file = join(POSTS_DIR, `${post.slug}.md`);
			const { data, content } = matter(readFileSync(file, "utf8"));
			data.category = newName;
			if (typeof data.published === "string") data.published = new Date(data.published);
			writeFileSync(file, matter.stringify(content, data));
			n += 1;
		}
		db.prepare("UPDATE taxonomies SET name = ? WHERE kind = 'category' AND name = ?").run(newName, oldName);
		audit(c, u.id, "aurora-category", "rename", `${oldName}→${newName}`, `ok(${n})`);
				triggerBuild("content-write");
		return c.json(ok(null, `已重命名，${n} 篇文章已同步`));
	}
	db.prepare("INSERT OR IGNORE INTO taxonomies (kind, name) VALUES ('category', ?)").run(newName);
	audit(c, u.id, "aurora-category", "create", newName, "ok");
	return c.json(ok(null, "分类已添加，发布文章时可直接选用"));
});
auroraRouter.delete("/api/admin/categories", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	const all = [...new Set(scanPosts().map((p) => p.category))];
	const used = new Set(all.filter((n) => ids.includes(hashId(n))));
	if (used.size) return c.json(fail(500, `分类 ${[...used].join("、")} 仍有文章使用，请先在文章中改分类`));
	const names = presetNames("category").filter((n) => ids.includes(hashId(n)));
	for (const n of names) db.prepare("DELETE FROM taxonomies WHERE kind = 'category' AND name = ?").run(n);
	audit(c, u.id, "aurora-category", "delete", names.join(","), `ok(${names.length})`);
	return c.json(ok(null, names.length ? `已删除预注册分类 ${names.length} 个` : "没有可删除的分类"));
});

auroraRouter.get("/api/admin/tags", (c) => {
	const p = page(c);
	const map = new Map<string, number>();
	for (const post of scanPosts()) for (const t of post.tags) map.set(t, (map.get(t) ?? 0) + 1);
	for (const name of presetNames("tag")) if (!map.has(name)) map.set(name, 0);
	const rows = [...map.entries()].map(([name, n]) => ({ id: hashId(name), tagName: name, articleCount: n }));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.get("/api/admin/tags/search", (c) => {
	const kw = (c.req.query("keywords") || "").toLowerCase();
	const map = new Map<string, number>();
	for (const post of scanPosts()) for (const t of post.tags) map.set(t, (map.get(t) ?? 0) + 1);
	for (const name of presetNames("tag")) if (!map.has(name)) map.set(name, 0);
	return c.json(ok([...map.entries()].filter(([n]) => n.toLowerCase().includes(kw)).map(([n, c2]) => ({ id: hashId(n), tagName: n, articleCount: c2 }))));
});
auroraRouter.get("/api/admin/tags/all", (c) => {
	const set = new Set<string>();
	for (const post of scanPosts()) for (const t of post.tags) set.add(t);
	for (const name of presetNames("tag")) set.add(name);
	return c.json(ok([...set].map((n) => ({ id: hashId(n), tagName: n }))));
});
auroraRouter.post("/api/admin/tags", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const newName = String(body.tagName || "").trim();
	if (!body.id) {
		if (!newName) return c.json(fail(500, "名称不能为空"), 200);
		db.prepare("INSERT OR IGNORE INTO taxonomies (kind, name) VALUES ('tag', ?)").run(newName);
		audit(c, u.id, "aurora-tag", "create", newName, "ok");
		return c.json(ok(null, "标签已添加，发布文章时可直接选用"));
	}
	if (!newName) return c.json(fail(500, "名称不能为空"), 200);
	const derived = [...new Set(scanPosts().flatMap((p) => p.tags))];
	const preset = presetNames("tag");
	const oldName = [...derived, ...preset].find((n) => hashId(n) === Number(body.id));
	if (!oldName) return c.json(fail(500, "标签不存在"), 200);
	let n = 0;
	for (const post of scanPosts().filter((p) => p.tags.includes(oldName))) {
		const file = join(POSTS_DIR, `${post.slug}.md`);
		const { data, content } = matter(readFileSync(file, "utf8"));
		data.tags = (data.tags as string[]).map((t) => (t === oldName ? newName : t));
		if (typeof data.published === "string") data.published = new Date(data.published);
		writeFileSync(file, matter.stringify(content, data));
		n += 1;
	}
	db.prepare("UPDATE taxonomies SET name = ? WHERE kind = 'tag' AND name = ?").run(newName, oldName);
	audit(c, u.id, "aurora-tag", "rename", `${oldName}→${newName}`, `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok(null, `已重命名，${n} 篇文章同步`));
});
auroraRouter.delete("/api/admin/tags", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	const all = [...new Set(scanPosts().flatMap((p) => p.tags))];
	const names = [...new Set([...all, ...presetNames("tag")])].filter((n) => ids.includes(hashId(n)));
	let n = 0;
	for (const post of scanPosts()) {
		if (!post.tags.some((t) => names.includes(t))) continue;
		const file = join(POSTS_DIR, `${post.slug}.md`);
		const { data, content } = matter(readFileSync(file, "utf8"));
		data.tags = (data.tags as string[]).filter((t) => !names.includes(t));
		if (typeof data.published === "string") data.published = new Date(data.published);
		writeFileSync(file, matter.stringify(content, data));
		n += 1;
	}
	for (const name of presetNames("tag")) {
		if (names.includes(name) && !all.includes(name)) db.prepare("DELETE FROM taxonomies WHERE kind = 'tag' AND name = ?").run(name);
	}
	audit(c, u.id, "aurora-tag", "delete", names.join(","), `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok(null, `已从 ${n} 篇文章移除`));
});
auroraRouter.put("/api/admin/categories/sort", (c) => c.json(ok()));
auroraRouter.put("/api/admin/tags/sort", (c) => c.json(ok()));

// ══════════ 说说（src/content/dynamic）══════════
const listTalks = () =>
	readdirSync(DYNAMIC_DIR).filter((f) => f.endsWith(".md")).sort().reverse().map((f) => {
		const { data, content } = matter(readFileSync(join(DYNAMIC_DIR, f), "utf8"));
		return { file: f, data, content, id: hashId(f) };
	});

auroraRouter.get("/api/admin/talks", (c) => {
	const p = page(c);
	const rows = listTalks().map((t) => ({
		id: t.id, content: t.content.trim(), images: "", isTop: Boolean(t.data.pinned), status: 1,
		createTime: String(t.data.published ?? "").slice(0, 19).replace("T", " "),
	}));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.get("/api/admin/talks/:id", (c) => {
	const t = listTalks().find((x) => x.id === Number(c.req.param("id")));
	if (!t) return c.json(fail(500, "说说不存在"), 200);
	return c.json(ok({ id: t.id, content: t.content.trim(), images: "", isTop: Boolean(t.data.pinned), status: 1, createTime: String(t.data.published ?? "").slice(0, 19) }));
});
auroraRouter.post("/api/admin/talks", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	let content = String(body.content || "").trim();
	if (!content) return c.json(fail(500, "内容不能为空"), 200);
	if (body.images) {
		const imgs = String(body.images).split(",").map((s) => s.trim()).filter(Boolean);
		if (imgs.length) content += "\n\n" + imgs.map((i) => `![照片](${i})`).join("\n\n");
	}
	const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
	const g = (t: string) => fmt.find((x) => x.type === t)?.value ?? "00";
	const file = `${g("year")}-${g("month")}-${g("day")}-${g("hour")}${g("minute")}${g("second")}.md`;
	const data: any = { published: new Date(`${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}+08:00`) };
	if (body.isTop) data.pinned = true;
	writeFileSync(join(DYNAMIC_DIR, file), matter.stringify(content, data));
	audit(c, u.id, "aurora-talk", "create", file, "ok");
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.put("/api/admin/talks", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const t = listTalks().find((x) => x.id === Number(body.id));
	if (!t) return c.json(fail(500, "说说不存在"), 200);
	const data: any = { ...t.data };
	if (body.isTop !== undefined) data.pinned = Boolean(body.isTop);
	if (typeof data.published === "string") data.published = new Date(data.published);
	writeFileSync(join(DYNAMIC_DIR, t.file), matter.stringify(String(body.content ?? t.content), data));
	audit(c, u.id, "aurora-talk", "update", t.file, "ok");
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.delete("/api/admin/talks", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	let n = 0;
	for (const t of listTalks().filter((x) => ids.includes(x.id))) {
		unlinkSync(join(DYNAMIC_DIR, t.file));
		n += 1;
	}
	audit(c, u.id, "aurora-talk", "delete", ids.join(","), `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.post("/api/admin/talks/images", async (c) => {
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	const url = await saveUpload(file, "");
	return c.json(ok(url));
});

// ══════════ 相册 / 照片（src/data/gallery.json + public/gallery）══════════
const readGallery = () => JSON.parse(readFileSync(GALLERY_JSON, "utf8"));
const writeGallery = (g: any) => writeFileSync(GALLERY_JSON, JSON.stringify(g, null, "\t") + "\n");

const albumDir = (albumId: number) => {
	const g = readGallery();
	const album = (g.albums ?? []).find((a: any) => hashId(a.id) === albumId);
	return album ? { album, dir: join(GALLERY_DIR, album.id), key: album.id } : null;
};

const listAlbumPhotos = (key: string, trashed = false) => {
	const dir = join(GALLERY_DIR, key, trashed ? ".trash" : "");
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => IMG_EXT.has(f.slice(f.lastIndexOf(".")).toLowerCase()))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((f) => ({
			id: hashId(`${key}/${trashed ? ".trash/" : ""}${f}`),
			albumId: hashId(key),
			photoName: f,
			photoSrc: `/gallery/${key}/${trashed ? ".trash/" : ""}${f}`,
			isDelete: trashed ? 1 : 0,
			createTime: "",
		}));
};

auroraRouter.get("/api/admin/photos/albums", (c) => {
	const p = page(c);
	const g = readGallery();
	const rows = (g.albums ?? []).map((a: any) => {
		const photos = listAlbumPhotos(a.id);
		return {
			id: hashId(a.id), albumName: a.name, albumDesc: a.description ?? "", albumCover: a.cover ?? photos[0]?.photoSrc ?? "",
			status: 1, createTime: a.date ?? "", photoCount: photos.length,
		};
	});
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.get("/api/admin/photos/albums/info", (c) => {
	const g = readGallery();
	return c.json(ok((g.albums ?? []).map((a: any) => ({ id: hashId(a.id), albumName: a.name }))));
});
auroraRouter.get("/api/admin/photos/albums/:id/info", (c) => {
	const found = albumDir(Number(c.req.param("id")));
	if (!found) return c.json(fail(500, "相册不存在"), 200);
	return c.json(ok({ id: hashId(found.key), albumName: found.album.name, albumDesc: found.album.description ?? "" }));
});
auroraRouter.post("/api/admin/photos/albums", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const key = String(body.albumKey || body.id || "").trim() || slugify(String(body.albumName || "album"));
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) return c.json(fail(500, "相册目录名只允许字母数字-_"), 200);
	const g = readGallery();
	if ((g.albums ?? []).some((a: any) => a.id === key)) return c.json(fail(500, "相册已存在"), 200);
	g.albums.push({
		id: key, name: String(body.albumName || key), description: String(body.albumDesc ?? ""),
		location: "", date: new Date().toISOString().slice(0, 10), tags: [],
	});
	writeGallery(g);
	mkdirSync(join(GALLERY_DIR, key), { recursive: true });
	audit(c, u.id, "aurora-album", "create", key, "ok");
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.put("/api/admin/photos/albums", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const found = albumDir(Number(body.id));
	if (!found) return c.json(fail(500, "相册不存在"), 200);
	if (body.albumName !== undefined) found.album.name = String(body.albumName);
	if (body.albumDesc !== undefined) found.album.description = String(body.albumDesc);
	writeGallery(readGallery());
	audit(c, u.id, "aurora-album", "update", found.key, "ok");
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.delete("/api/admin/photos/albums/:id", (c) => {
	const u = me(c)!;
	const found = albumDir(Number(c.req.param("id")));
	if (!found) return c.json(fail(500, "相册不存在"), 200);
	const g = readGallery();
	g.albums = (g.albums ?? []).filter((a: any) => a.id !== found.key);
	writeGallery(g);
	rmSync(found.dir, { recursive: true, force: true });
	audit(c, u.id, "aurora-album", "delete", found.key, "ok");
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.post("/api/admin/photos/albums/upload", async (c) => {
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	const url = await saveUpload(file, "");
	return c.json(ok(url));
});

auroraRouter.get("/api/admin/photos", (c) => {
	const p = page(c);
	const albumId = Number(c.req.query("albumId") || 0);
	const isDelete = Number(c.req.query("isDelete") || 0);
	const g = readGallery();
	const albums = albumId ? [g.albums.find((a: any) => hashId(a.id) === albumId)].filter(Boolean) : g.albums ?? [];
	let rows: any[] = [];
	for (const a of albums) rows = rows.concat(listAlbumPhotos(a.id, isDelete === 1));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.post("/api/admin/photos/upload", async (c) => {
	const u = me(c)!;
	const body = await c.req.parseBody({ all: true });
	const albumId = Number(body.albumId || 0);
	const found = albumDir(albumId);
	if (!found) return c.json(fail(500, "相册不存在"), 200);
	const files = (Array.isArray(body.files) ? body.files : [body.files]).filter((f: any) => f instanceof File);
	if (!files.length) return c.json(fail(500, "未收到文件"), 200);
	let next = listAlbumPhotos(found.key).length + 1;
	const urls: string[] = [];
	for (const f of files as File[]) {
		const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
		if (!IMG_EXT.has(ext)) continue;
		if (f.size > 10 * 1024 * 1024) continue;
		const name = `${next}${ext}`;
		writeFileSync(join(found.dir, name), Buffer.from(await f.arrayBuffer()));
		urls.push(`/gallery/${found.key}/${name}`);
		next += 1;
	}
	audit(c, u.id, "aurora-photo", "upload", found.key, `ok(${urls.length})`);
				triggerBuild("content-write");
	return c.json(ok(urls[0] ?? ""));
});
auroraRouter.post("/api/admin/photos", (c) => c.json(ok()));
auroraRouter.put("/api/admin/photos", (c) => c.json(ok()));
auroraRouter.put("/api/admin/photos/delete", async (c) => {
	// 进回收站 / 恢复
	const u = me(c)!;
	const body = await c.req.json();
	const ids: number[] = idListOf(body);
	const toTrash = Number(body.isDelete ?? 1) === 1;
	const g = readGallery();
	let n = 0;
	for (const a of g.albums ?? []) {
		for (const photo of listAlbumPhotos(a.id, !toTrash)) {
			if (!ids.includes(photo.id)) continue;
			const src = join(GALLERY_DIR, a.id, toTrash ? photo.photoName : `.trash/${photo.photoName}`);
			const destDir = join(GALLERY_DIR, a.id, toTrash ? ".trash" : "");
			mkdirSync(destDir, { recursive: true });
			renameSync(src, join(destDir, photo.photoName));
			n += 1;
		}
	}
	audit(c, u.id, "aurora-photo", toTrash ? "trash" : "restore", ids.join(","), `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok());
});
auroraRouter.delete("/api/admin/photos", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	const g = readGallery();
	let n = 0;
	for (const a of g.albums ?? []) {
		for (const photo of [...listAlbumPhotos(a.id), ...listAlbumPhotos(a.id, true)]) {
			if (!ids.includes(photo.id)) continue;
			unlinkSync(join(GALLERY_DIR, a.id, photo.photoSrc.replace(`/gallery/${a.id}/`, "")));
			n += 1;
		}
	}
	audit(c, u.id, "aurora-photo", "delete", ids.join(","), `ok(${n})`);
				triggerBuild("content-write");
	return c.json(ok());
});

// ══════════ 友链（src/data/friends.json，前后台同一份数据：后台 CRUD 落 JSON，前台构建读取）══════════
const FRIENDS_JSON = join(BLOG_ROOT, "src/data/friends.json");
const readFriends = (): any[] => {
	try {
		return JSON.parse(readFileSync(FRIENDS_JSON, "utf8"));
	} catch {
		return [];
	}
};
const writeFriends = (list: any[]) => writeFileSync(FRIENDS_JSON, JSON.stringify(list, null, "\t") + "\n");
const friendId = (f: any) => hashId(String(f.siteurl || f.title));

auroraRouter.get("/api/admin/links", (c) => {
	const p = page(c);
	const rows = readFriends().map((f: any) => ({
		id: friendId(f), linkName: f.title, linkIntro: f.desc ?? "", linkAvatar: f.imgurl ?? "",
		linkAddress: f.siteurl, createTime: "", isReview: f.enabled === false ? 0 : 1,
	}));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.post("/api/admin/links", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const url = String(body.linkAddress || "").trim();
	if (!/^https?:\/\//.test(url)) return c.json(fail(500, "链接地址必须以 http(s):// 开头"), 200);
	const list = readFriends();
	const existing = list.find((f: any) => String(f.siteurl) === url);
	if (existing) {
		if (body.linkName !== undefined) existing.title = String(body.linkName);
		if (body.linkIntro !== undefined) existing.desc = String(body.linkIntro ?? "");
		if (body.linkAvatar !== undefined) existing.imgurl = String(body.linkAvatar ?? "");
		writeFriends(list);
		audit(c, u.id, "aurora-links", "update", url, "ok");
		return c.json(ok(null, "友链已更新"));
	}
	list.push({
		title: String(body.linkName || url), imgurl: String(body.linkAvatar ?? ""),
		desc: String(body.linkIntro ?? ""), siteurl: url, tags: [], weight: 999, enabled: true,
	});
	writeFriends(list);
	audit(c, u.id, "aurora-links", "create", url, "ok");
				triggerBuild("content-write");
	return c.json(ok(null, "友链已新增（前台重新构建后可见）"));
});
auroraRouter.delete("/api/admin/links", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const ids: number[] = idListOf(body);
	const before = readFriends();
	const after = before.filter((f: any) => !ids.includes(friendId(f)));
	writeFriends(after);
	audit(c, u.id, "aurora-links", "delete", ids.join(","), `ok(${before.length - after.length})`);
				triggerBuild("content-write");
	return c.json(ok(null, "友链已删除"));
});
auroraRouter.post("/api/links/avatar", async (c) => {
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	return c.json(ok(await saveUpload(file, "")));
});

// ══════════ 网站配置 / 关于 / 公告（SQLite 单行 JSON，暂不驱动前台构建）══════════
const defaultWebsiteConfig = () => ({
	name: "启明的博客", englishName: "AI 资讯与技术笔记", author: "启明", authorAvatar: "/favicon/mascot-128.png", authorIntro: "AI 资讯与技术笔记",
	logo: "", multiLanguage: 1, notice: "欢迎来到启明的博客：这里持续更新 AI 资讯、技术解读与工程实践。",
	websiteCreateTime: "2026-09-01", beianNumber: "陇ICP备2026009491号-1", qqLogin: 0, github: "https://github.com/liqiming123", gitee: "", qq: "", weChat: "", weibo: "",
	csdn: "", zhihu: "", juejin: "", twitter: "", stackoverflow: "", touristAvatar: "", userAvatar: "",
	isCommentReview: 1, isEmailNotice: 0, isReward: 0, weiXinQRCode: "", alipayQRCode: "",
	favicon: "/favicon/mascot-32.png", websiteTitle: "启明 - AI 资讯与技术笔记", gongzhenghao: "",
});
auroraRouter.get("/api/admin/website/config", (c) => {
	const saved = getMeta("aurora_website_config");
	return c.json(ok(saved ? JSON.parse(saved) : defaultWebsiteConfig()));
});
auroraRouter.put("/api/admin/website/config", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const current = getMeta("aurora_website_config");
	setMeta("aurora_website_config", JSON.stringify({ ...(current ? JSON.parse(current) : defaultWebsiteConfig()), ...body }));
	audit(c, u.id, "aurora-website", "update-config", "", "ok");
	return c.json(ok(null, "已保存（运行时配置，驱动前台构建在后续阶段接入）"));
});
auroraRouter.post("/api/admin/config/images", async (c) => {
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	return c.json(ok(await saveUpload(file, "")));
});

const BOOKNAV_JSON = join(BLOG_ROOT, "src/data/booknav.json");
const ABOUT_MD = join(BLOG_ROOT, "src/content/spec/about.md");

// ── 书签导航管理：读写 src/data/booknav.json（前台薄导入层同源），保存触发构建上线 ──
auroraRouter.get("/api/admin/booknav", (c) => {
	if (!me(c)) return c.json(fail(40001, "未登录"), 200);
	try {
		return c.json(ok({ groups: JSON.parse(readFileSync(BOOKNAV_JSON, "utf8")) }));
	} catch {
		return c.json(ok({ groups: [] }));
	}
});

auroraRouter.put("/api/admin/booknav", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const groups = body.groups;
	if (!Array.isArray(groups)) return c.json(fail(500, "groups 必须是数组"), 200);
	for (const g of groups) {
		if (!g?.id || !g?.name || !Array.isArray(g.items))
			return c.json(fail(500, "分组缺少 id/name/items"), 200);
		for (const it of g.items) {
			if (!it?.title || !it?.url) return c.json(fail(500, `分组「${g.name}」存在缺少标题或链接的书签`), 200);
		}
	}
	writeFileSync(BOOKNAV_JSON, `${JSON.stringify(groups, null, "\t")}\n`);
	audit(c, u.id, "aurora-booknav", "update", `${groups.length} groups`, "ok");
	triggerBuild("content-write");
	return c.json(ok(null, "书签已保存，前台将在构建完成后更新（约 40 秒）"));
});

auroraRouter.get("/api/admin/about", (c) => {
	if (!me(c)) return c.json(fail(40001, "未登录"), 200);
	// about.md 是前台关于页的真相源（spec collection 无 frontmatter，纯 Markdown 直写）
	try {
		return c.json(ok({ content: readFileSync(ABOUT_MD, "utf8") }));
	} catch {
		return c.json(ok({ content: getMeta("aurora_about") || "# 关于\n\n启明的博客。" }));
	}
});

auroraRouter.put("/api/admin/about", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const content = String(body.content ?? "");
	setMeta("aurora_about", content);
	writeFileSync(ABOUT_MD, content);
	audit(c, u.id, "aurora-about", "update", "about.md", "ok");
	triggerBuild("content-write");
	return c.json(ok(null, "关于页已保存，前台将在构建完成后更新（约 40 秒）"));
});
// aurora 原版关于页编辑器的读取端点是公开的 /api/about（保存走 /api/admin/about）
auroraRouter.get("/api/about", (c) => {
	try {
		return c.json(ok({ content: readFileSync(ABOUT_MD, "utf8") }));
	} catch {
		return c.json(ok({ content: getMeta("aurora_about") || "# 关于\n\n启明的博客。" }));
	}
});
auroraRouter.get("/api/admin/notice", (c) => {
	const saved = getMeta("aurora_website_config");
	const cfg = saved ? JSON.parse(saved) : defaultWebsiteConfig();
	return c.json(ok({ notice: cfg.notice ?? "" }));
});
auroraRouter.put("/api/admin/notice", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	const saved = getMeta("aurora_website_config");
	const cfg = saved ? JSON.parse(saved) : defaultWebsiteConfig();
	cfg.notice = String(body.notice ?? "");
	setMeta("aurora_website_config", JSON.stringify(cfg));
	// 同步前台真相源：前台侧栏公告读 src/config/announcementConfig.ts（构建期），
	// 改文件 + 触发构建上线（与友链同款模式）；JSON.stringify 产物即合法 TS 字符串字面量
	const configFile = join(BLOG_ROOT, "src/config/announcementConfig.ts");
	try {
		const src = readFileSync(configFile, "utf8");
		const next = src.replace(
			/(content:\s*)(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
			`$1${JSON.stringify(cfg.notice)}`,
		);
		if (next === src && !src.includes(`content: ${JSON.stringify(cfg.notice)}`)) {
			audit(c, u.id, "aurora-notice", "update", "announcementConfig.ts", "fail(未匹配到 content 字段)");
			return c.json(fail(500, "前台公告配置文件结构异常，未写入（后台配置已更新）"), 200);
		}
		writeFileSync(configFile, next);
	} catch (e) {
		audit(c, u.id, "aurora-notice", "update", "announcementConfig.ts", `fail(${String(e).slice(0, 60)})`);
		return c.json(fail(500, "前台公告配置写入失败：" + String(e).slice(0, 80)), 200);
	}
	audit(c, u.id, "aurora-notice", "update", "announcementConfig.ts", "ok");
	triggerBuild("content-write");
	return c.json(ok(null, "公告已保存，前台将在构建完成后更新（约 40 秒）"));
});
auroraRouter.get("/api/admin/statistics", (c) => c.json(ok({})));

// ══════════ 日志（audit_logs 映射为操作日志 / exception_logs 映射为异常日志）══════════
// 日志管理页展示用中文名；未收录的值原样回退（新增埋点时记得补表）
const AUDIT_MODULE_ZH: Record<string, string> = {
	"aurora-auth": "认证登录",
	"aurora-article": "文章管理",
	"aurora-category": "分类管理",
	"aurora-tag": "标签管理",
	"aurora-talk": "说说管理",
	"aurora-album": "相册管理",
	"aurora-photo": "照片管理",
	"aurora-links": "友链管理",
	"aurora-comment": "评论管理",
	"aurora-notice": "公告管理",
	"aurora-about": "关于页",
	"aurora-booknav": "书签导航",
	"aurora-user": "用户资料",
	"aurora-website": "网站配置",
	"aurora-log": "日志管理",
	auth: "认证登录",
	gateway: "安全网关",
};
const AUDIT_ACTION_ZH: Record<string, string> = {
	login: "登录",
	logout: "退出登录",
	"login-code": "发送验证码",
	register: "注册",
	create: "发布",
	delete: "删除",
	update: "更新",
	"update-info": "更新资料",
	reply: "回复评论",
	"notify-switch": "邮件通知开关",
	"artalk-session": "评论身份绑定",
	"rate-limited": "触发限流",
	fail: "登录失败",
	clear: "清空",
	bootstrap: "初始化建号",
};
auroraRouter.get("/api/admin/operation/logs", (c) => {
	const p = page(c);
	const rows = (db
		.prepare("SELECT l.*, u.username FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 500")
		.all() as any[]).map((l) => ({
		id: l.id,
		optModule: AUDIT_MODULE_ZH[l.module] ?? l.module ?? "-",
		optType: AUDIT_ACTION_ZH[l.action] ?? l.action ?? "-",
		optDesc: [l.target, l.detail].filter(Boolean).join(" ") || "-",
		requestMethod: l.method || "-",
		nickname: l.username ?? "-",
		ipAddress: l.ip || "-",
		// 历史日志没有 ip，归属地一并列 -；lookupArea 离线查（观星台同款）
		ipSource: l.ip ? (lookupArea(l.ip) ?? "-") : "-",
		createTime: l.created_at,
	}));
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.delete("/api/admin/operation/logs", async (c) => {
	const u = me(c)!;
	db.prepare("DELETE FROM audit_logs").run();
	audit(c, u.id, "aurora-log", "clear", "operation", "ok");
	return c.json(ok());
});
auroraRouter.get("/api/admin/exception/logs", (c) => {
	const p = page(c);
	const rows = db
		.prepare("SELECT * FROM exception_logs ORDER BY id DESC LIMIT 500")
		.all() as any[];
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.delete("/api/admin/exception/logs", (c) => {
	db.prepare("DELETE FROM exception_logs").run();
	audit(c, me(c)?.id ?? null, "aurora-log", "clear", "exception", "ok");
	return c.json(ok());
});

// ══════════ 用户管理 / 在线（真实 users + sessions 表）══════════
auroraRouter.get("/api/admin/users", (c) => {
	const p = page(c);
	const kw = String(c.req.query("keywords") || "").toLowerCase();
	// 后台账号（admin.db）+ Artalk 评论注册用户合并展示；id 加前缀防与后台数字 id 冲突
	const adminRows = (db.prepare("SELECT * FROM users ORDER BY id").all() as any[]).map((u) => {
		const sess = db.prepare("SELECT ip, ua, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(u.id) as any;
		return {
			id: u.id, userInfoId: u.id, source: "admin", avatar: u.avatar || "", nickname: u.nickname || u.username, email: u.email || u.username,
			roles: [{ id: 1, roleName: u.role === "admin" ? "站长" : u.role === "banned" ? "已禁用" : "后台用户" }],
			loginType: 1, ipAddress: sess?.ip ?? "", ipSource: sess?.ip ? (lookupArea(sess.ip) ?? "") : "",
			createTime: u.created_at, lastLoginTime: sess?.created_at ?? u.created_at,
			isDisable: u.role === "banned" ? 1 : 0, status: null, comments: null,
		};
	});
	const artalkRows = artalkMembers()
		.filter((m) => !kw || `${m.name} ${m.email}`.toLowerCase().includes(kw))
		.map((m) => ({
			id: `atk-${m.id}`, userInfoId: `atk-${m.id}`, source: "artalk", avatar: "", nickname: m.name, email: m.email,
			roles: [{ id: m.is_admin ? 3 : 4, roleName: m.is_admin ? "评论管理员" : "评论用户" }],
			loginType: 1, ipAddress: "", ipSource: "",
			createTime: m.created_at, lastLoginTime: m.created_at,
			isDisable: 0, status: null, comments: m.comments,
		}));
	const rows = [...adminRows.filter((r) => !kw || `${r.nickname} ${r.email}`.toLowerCase().includes(kw)), ...artalkRows];
	return c.json(ok(paged(rows, p.current, p.size)));
});
auroraRouter.put("/api/admin/users", (c) => c.json(ok()));
auroraRouter.put("/api/admin/users/disable", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	if (body.source === "artalk" || String(body.id).startsWith("atk-"))
		return c.json(fail(500, "评论用户的身份请在「角色管理」中调整"), 200);
	db.prepare("UPDATE users SET role = CASE WHEN role = 'banned' THEN 'user' ELSE 'banned' END WHERE id = ?").run(Number(body.id));
	audit(c, u.id, "aurora-user", "disable", String(body.id), "ok");
	return c.json(ok());
});
auroraRouter.put("/api/admin/users/role", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	// Artalk 评论用户：切换评论管理员身份（走 Artalk API）
	if (body.source === "artalk" || String(body.userId ?? body.id).startsWith("atk-")) {
		try {
			await setArtalkAdmin(Number(String(body.userId ?? body.id).replace(/^atk-/, "")), Boolean(body.isAdmin));
			audit(c, u.id, "aurora-comment", "role", `${body.nickname ?? body.userId ?? body.id}→${body.isAdmin ? "评论管理员" : "评论用户"}`, "ok");
			return c.json(ok(null, body.isAdmin ? "已设为评论管理员" : "已取消评论管理员"));
		} catch (e) {
			return c.json(fail(500, `操作失败：${String(e).slice(0, 60)}`), 200);
		}
	}
	const role = Array.isArray(body.roleIds) && body.roleIds.some((r: any) => Number(r.id ?? r) === 1) ? "admin" : "user";
	db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, Number(body.userId ?? body.id));
	audit(c, u.id, "aurora-user", "role", `${body.userId ?? body.id}→${role}`, "ok");
	return c.json(ok());
});
auroraRouter.get("/api/admin/users/role", (c) => {
	const members = artalkMembers();
	return c.json(
		ok([
			{ id: 1, roleName: "站长", isDisable: 0, description: "后台管理员，拥有全部权限" },
			{ id: 3, roleName: "评论管理员", isDisable: 0, description: "Artalk 评论区管理员，可管理评论" },
			{ id: 4, roleName: "评论用户", isDisable: 0, description: "评论区注册用户，可评论与接收回复通知" },
		]),
	);
});
auroraRouter.put("/api/admin/users/password", async (c) => {
	const u = me(c)!;
	const body = await c.req.json();
	if (!body.password || String(body.password).length < 8) return c.json(fail(500, "密码至少 8 位"), 200);
	db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(String(body.password)), Number(body.id));
	audit(c, u.id, "aurora-user", "reset-password", String(body.id), "ok");
	return c.json(ok());
});
auroraRouter.delete("/api/admin/users/:id", (c) => {
	const u = me(c)!;
	db.prepare("DELETE FROM sessions WHERE user_id = ?").run(Number(c.req.param("id")));
	audit(c, u.id, "aurora-user", "kick", c.req.param("id"), "ok");
	return c.json(ok(null, "已强制下线该用户全部会话"));
});
auroraRouter.get("/api/admin/users/online", (c) => {
	// 后台登录会话；同一人多次登录会堆积多条，按用户去重只显示最新一条
	const raw = db
		.prepare(
			`SELECT s.token, s.ip, s.ua, s.created_at, u.id AS uid, u.nickname, u.username
			FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > ?
			ORDER BY s.created_at DESC`,
		)
		.all(Date.now()) as any[];
	const seen = new Set<number>();
	const rows = raw
		.filter((s) => (seen.has(s.uid) ? false : (seen.add(s.uid), true)))
		.map((s) => ({
			id: s.uid, nickname: s.nickname || s.username, ipAddress: s.ip || "",
			ipSource: s.ip ? (lookupArea(s.ip) ?? "") : "",
			browser: (s.ua || "").slice(0, 60), os: "", lastLoginTime: s.created_at,
		}));
	return c.json(ok({ records: rows, count: rows.length }));
});
auroraRouter.delete("/api/admin/users/:id/online", (c) => {
	const u = me(c)!;
	db.prepare("DELETE FROM sessions WHERE user_id = ?").run(Number(c.req.param("id")));
	audit(c, u.id, "aurora-user", "kick", c.req.param("id"), "ok");
	return c.json(ok());
});
auroraRouter.post("/api/users/avatar", async (c) => {
	const u = me(c)!;
	const body = await c.req.parseBody();
	const file = (Object.values(body).find((f: any) => f instanceof File) as File) || body.file;
	if (!(file instanceof File)) return c.json(fail(500, "未收到文件"), 200);
	const url = await saveUpload(file, "avatars/");
	db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(url, u.id);
	return c.json(ok(url));
});

// ══════════ 定时任务（本地无 Quartz：空数据保持页面可用）══════════
auroraRouter.get("/api/admin/jobs", (c) => c.json(ok({ records: [], count: 0 })));
auroraRouter.get("/api/admin/jobs/jobGroups", (c) => c.json(ok([])));
auroraRouter.post("/api/admin/jobs", (c) => c.json(ok(null, "本地运行模式暂无定时任务调度器")));
auroraRouter.put("/api/admin/jobs", (c) => c.json(ok()));
auroraRouter.delete("/api/admin/jobs", (c) => c.json(ok()));
auroraRouter.put("/api/admin/jobs/status", (c) => c.json(ok()));
auroraRouter.put("/api/admin/jobs/run", (c) => c.json(ok(null, "本地运行模式暂无调度器")));
auroraRouter.get("/api/admin/jobLogs", (c) => c.json(ok({ records: [], count: 0 })));
auroraRouter.delete("/api/admin/jobLogs", (c) => c.json(ok()));
auroraRouter.delete("/api/admin/jobLogs/clean", (c) => c.json(ok()));

// ══════════ 评论管理（Waline 协议外壳 → 数据接 Artalk，列表读库/写走 API）══════════
const walineErr = (msg: string) => ({ errno: 1, errmsg: msg, data: null });

auroraRouter.get("/api/waline/api/comment", (c) => {
	const u = me(c);
	if (!u) return c.json(walineErr("未登录"), 200);
	const q = c.req.query();
	if (q.type === "count") return c.json({ errno: 0, errmsg: "", data: pendingCount() });
	if (q.type === "recent") return c.json({ errno: 0, errmsg: "", data: listComments({ page: 1, pageSize: 10 }).rows });
	const r = listComments({
		status: q.status || "",
		keyword: q.keyword || "",
		page: Math.max(1, Number(q.page) || 1),
		pageSize: Math.min(50, Math.max(1, Number(q.pageSize) || 10)),
	});
	return c.json({ errno: 0, errmsg: "", data: { data: r.rows, count: r.count, page: r.page, totalPages: r.totalPages } });
});
auroraRouter.post("/api/waline/api/comment", async (c) => {
	const u = me(c);
	if (!u) return c.json(walineErr("未登录"), 200);
	const body = await c.req.json().catch(() => ({}));
	const content = String(body.comment || "").trim();
	const targetId = Number(body.pid || body.rid || 0);
	if (!content) return c.json(walineErr("回复内容不能为空"), 200);
	if (!targetId) return c.json(walineErr("缺少回复目标"), 200);
	try {
		await replyComment(targetId, content);
		audit(c, u.id, "aurora-comment", "reply", String(targetId), "ok");
		return c.json({ errno: 0, errmsg: "", data: {} });
	} catch (e: any) {
		return c.json(walineErr(e.message || "回复失败"), 200);
	}
});
auroraRouter.put("/api/waline/api/comment/:id", async (c) => {
	const u = me(c);
	if (!u) return c.json(walineErr("未登录"), 200);
	const body = await c.req.json().catch(() => ({}));
	const patch: { status?: string; sticky?: number; comment?: string } = {};
	if (body.status !== undefined) patch.status = String(body.status);
	if (body.sticky !== undefined) patch.sticky = Number(body.sticky);
	if (body.comment !== undefined) patch.comment = String(body.comment);
	try {
		await updateComment(Number(c.req.param("id")), patch);
		audit(c, u.id, "aurora-comment", "update", c.req.param("id"), JSON.stringify(patch));
		return c.json({ errno: 0, errmsg: "", data: {} });
	} catch (e: any) {
		return c.json(walineErr(e.message || "更新失败"), 200);
	}
});
// 站长评论邮件通知开关：作用域=当前登录账号邮箱（管理台账号即邮箱）
auroraRouter.get("/api/admin/comment-notify", (c) => {
	const u = me(c)!;
	return c.json(ok({ enabled: getNotifyState(u.username) }));
});
auroraRouter.put("/api/admin/comment-notify", async (c) => {
	const u = me(c)!;
	const body = await c.req.json().catch(() => ({}));
	const enabled = Boolean(body.enabled);
	try {
		await setNotifyState(u.username, enabled);
		audit(c, u.id, "aurora-comment", "notify-switch", u.username, enabled ? "on" : "off");
		return c.json(ok(null, enabled ? "邮件通知已开启" : "邮件通知已关闭"));
	} catch (e: any) {
		return c.json(fail(500, e.message || "切换失败"), 200);
	}
});

auroraRouter.delete("/api/waline/api/comment/:id", async (c) => {
	const u = me(c);
	if (!u) return c.json(walineErr("未登录"), 200);
	try {
		await deleteComment(Number(c.req.param("id")));
		audit(c, u.id, "aurora-comment", "delete", c.req.param("id"), "ok");
		return c.json({ errno: 0, errmsg: "" });
	} catch (e: any) {
		return c.json(walineErr(e.message || "删除失败"), 200);
	}
});
auroraRouter.get("/api/waline/api/user", (c) => c.json({ errno: 0, errmsg: "", data: null }));

// ══════════ 通用上传 ══════════
async function saveUpload(file: File, sub: string): Promise<string> {
	const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
	if (!IMG_EXT.has(ext)) throw new Error(`不支持的格式 ${ext}`);
	if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB");
	const now = new Date();
	const dir = join(UPLOADS_DIR, sub, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
	mkdirSync(dir, { recursive: true });
	const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
	writeFileSync(join(dir, name), Buffer.from(await file.arrayBuffer()));
	return `/uploads/${sub ? sub + "/" : ""}${dir.split("/").pop()}/${name}`;
}

export { saveUpload };
