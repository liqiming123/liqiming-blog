import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireCsrf, audit, sessionMiddleware, type Env } from "./auth.js";
import { statsRouter } from "./stats.js";
import { postsRouter } from "./posts.js";
import { dashboardRouter } from "./dashboard.js";
import { authRouter } from "./auth.js";
import { contentRouter } from "./content.js";
import { auroraRouter } from "./aurora.js";
import { db } from "./db.js";
import { lookupArea } from "./ipregion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST = resolve(__dirname, "../../admin/dist");
const BLOG_PUBLIC = resolve(__dirname, "../../public");
const PORT = Number(process.env.PORT || 4322);

const app = new Hono<Env>();

// 1) 会话解析（cookie 或 Authorization: Bearer，两个管理台协议共用）
app.use("/api/*", sessionMiddleware);

// 2) 老协议（/api/v1/*）的鉴权网关：aurora 适配层（/api/*）在各自 handler 内自行校验
app.use("/api/v1/*", async (c, next) => {
	const path = c.req.path;
	if (path.startsWith("/api/v1/report") || path.startsWith("/api/v1/auth/")) return next();
	const user = c.get("user");
	if (!user) return c.json({ code: 401, message: "未登录" }, 401);
	if (c.req.method !== "GET" && !requireCsrf(c)) {
		audit(user.id, "gateway", "csrf-reject", path, "403");
		return c.json({ code: 403, message: "CSRF 校验失败" }, 403);
	}
	return next();
});

// 3) 业务路由：aurora 适配层 + 老接口
app.route("/", auroraRouter);
app.route("/", authRouter);
app.route("/", statsRouter);
app.route("/", postsRouter);
app.route("/", dashboardRouter);
app.route("/", contentRouter);

app.get("/api/v1/audit-logs", (c) => {
	const logs = db
		.prepare("SELECT id, user_id, module, action, target, result, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT 100")
		.all();
	return c.json({ logs });
});

// 4) 博客静态资源（gallery/uploads/favicon/images）与管理台同源，页面里图片直接可用
const serveBlogPublic = serveStatic({ root: BLOG_PUBLIC });
app.use("/gallery/*", serveBlogPublic);
app.use("/uploads/*", serveBlogPublic);
app.use("/favicon/*", serveBlogPublic);
app.use("/images/*", serveBlogPublic);
app.use("/assets/*", serveBlogPublic);

// 5) 404 JSON + 管理台 SPA fallback
app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) return c.json({ flag: false, code: 404, message: "Not Found", data: null }, 404);
	const index = resolve(ADMIN_DIST, "index.html");
	if (existsSync(index)) return c.html(readFileSync(index, "utf8"));
	return c.text("admin dist 未构建：请先 cd admin && npm run build", 503);
});

// ── 异常日志：请求级（onError）与进程级崩溃捕获，写 exception_logs 供管理台展示 ──
const recordException = (uri: string, method: string, ip: string, err: unknown) => {
	try {
		db.prepare(
			"INSERT INTO exception_logs (opt_uri, opt_desc, request_method, ip_address, ip_source) VALUES (?, ?, ?, ?, ?)",
		).run(uri, String(err?.stack || err || "unknown").slice(0, 2000), method, ip, lookupArea(ip) ?? "-");
	} catch {
		/* 记录失败不再抛出，避免递归 */
	}
};
app.onError((err, c) => {
	const ip = (c.req.header("x-forwarded-for") || "").split(",")[0].trim();
	recordException(c.req.path, c.req.method, ip, err);
	console.error(`[onError] ${c.req.method} ${c.req.path}:`, err);
	return c.json({ flag: false, code: 500, message: "服务器内部错误", data: null }, 500);
});
process.on("uncaughtException", (err) => {
	recordException("(process)", "uncaughtException", "", err);
	console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
	recordException("(process)", "unhandledRejection", "", reason);
	console.error("[unhandledRejection]", reason);
});

// 6) 管理台 SPA（aurora 布局版，History 路由挂在根路径）
if (existsSync(ADMIN_DIST)) {
	app.use("*", serveStatic({ root: ADMIN_DIST }));
	app.get("/", (c) => {
		const index = resolve(ADMIN_DIST, "index.html");
		return c.html(readFileSync(index, "utf8"));
	});
}

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, (info) => {
	console.log(`Firefly Admin → http://127.0.0.1:${info.port}/`);
	if (!existsSync(ADMIN_DIST)) console.log("提示：admin 前端尚未构建（cd admin && npm run build）");
});
