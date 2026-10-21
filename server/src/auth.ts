import { Hono } from "hono";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, getMeta } from "./db.js";

// ── 密码：scrypt（node 内置，无原生依赖；上线前可平移到 argon2id，哈希串自带算法前缀便于识别）──
const hashPassword = (password: string): string => {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(password, salt, 64).toString("hex");
	return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password: string, stored: string): boolean => {
	const [algo, salt, hash] = stored.split("$");
	if (algo !== "scrypt" || !salt || !hash) return false;
	const candidate = scryptSync(password, salt, 64);
	const expected = Buffer.from(hash, "hex");
	return (
		candidate.length === expected.length && timingSafeEqual(candidate, expected)
	);
};

// ── 会话 ─────────────────────────────────────────────
const SESSION_TTL = 7 * 24 * 3600 * 1000;

type SessionUser = {
	id: number;
	username: string;
	nickname: string;
	role: string;
};

export type Env = {
	Variables: { user?: SessionUser; sessionToken?: string };
};

const createSession = (userId: number, ip: string, ua: string) => {
	const token = randomBytes(32).toString("hex");
	const expires = Date.now() + SESSION_TTL;
	db.prepare(
		"INSERT INTO sessions (token, user_id, expires_at, created_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)",
	).run(token, userId, expires, Date.now(), ip, ua);
	return { token, expires };
};

export const cleanSessions = () => {
	db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
};

const getSessionUser = (token: string): SessionUser | null => {
	const row = db
		.prepare(
			`SELECT s.token, s.expires_at, u.id, u.username, u.nickname, u.role
			 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
		)
		.get(token) as
		| { token: string; expires_at: number; id: number; username: string; nickname: string; role: string }
		| undefined;
	if (!row || row.expires_at < Date.now()) return null;
	return {
		id: row.id,
		username: row.username,
		nickname: row.nickname,
		role: row.role,
	};
};

// ── 登录限流：IP+账号，15 分钟窗口 10 次失败 ───────────
const attempts = new Map<string, { count: number; resetAt: number }>();
const rateLimited = (key: string): boolean => {
	const now = Date.now();
	const entry = attempts.get(key);
	if (entry && entry.resetAt > now && entry.count >= 10) return true;
	if (!entry || entry.resetAt <= now) attempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
	return false;
};
const recordFail = (key: string) => {
	const entry = attempts.get(key);
	if (entry) entry.count += 1;
};
const clearFails = (key: string) => attempts.delete(key);

// ── 审计 ─────────────────────────────────────────────
export const audit = (
	userId: number | null,
	module: string,
	action: string,
	target: string,
	result: string,
	detail = "",
	// 请求上下文信息（ip/method 落审计日志，供日志管理页展示）；缺省时留空
	req?: { ip?: string; method?: string },
) => {
	db.prepare(
		"INSERT INTO audit_logs (user_id, module, action, target, result, detail, ip, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
	).run(userId, module, action, target, result, detail, req?.ip || "", req?.method || "");
};

const cookieSet = (c: any, name: string, value: string, maxAge: number, httpOnly: boolean) => {
	c.header(
		"Set-Cookie",
		`${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}`,
		{ append: true },
	);
};

// ── 路由 ─────────────────────────────────────────────
export const authRouter = new Hono<Env>();

// 会话解析中间件（由 index.ts 最先挂载；cookie 与 Bearer 两种载体都认）
export const sessionMiddleware = async (c: any, next: any) => {
	const bearer = c.req.header("authorization")?.match(/^Bearer\s+([a-f0-9]+)$/i)?.[1];
	const token =
		bearer ||
		c.req.header("cookie")?.match(/ff_session=([a-f0-9]+)/)?.[1];
	if (token) {
		const user = getSessionUser(token);
		if (user) {
			c.set("user", user);
			c.set("sessionToken", token);
		}
	}
	await next();
};

// CSRF 校验：会话内写操作必须带与 cookie 一致的 X-CSRF-Token
export const requireCsrf = (c: any): boolean => {
	const cookieToken = c.req.header("cookie")?.match(/ff_csrf=([a-f0-9]+)/)?.[1];
	const headerToken = c.req.header("x-csrf-token");
	return Boolean(cookieToken && headerToken && cookieToken === headerToken);
};

authRouter.get("/api/v1/auth/status", (c) => {
	const userCount = (
		db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }
	).n;
	if (userCount === 0) {
		return c.json({ needsBootstrap: true, loggedIn: false });
	}
	const user = c.get("user");
	if (!user) return c.json({ needsBootstrap: false, loggedIn: false });
	const csrf = c.req.header("cookie")?.match(/ff_csrf=([a-f0-9]+)/)?.[1];
	return c.json({ needsBootstrap: false, loggedIn: true, user, csrf });
});

// 首次启动：创建管理员并直接登录
authRouter.post("/api/v1/auth/bootstrap", async (c) => {
	const userCount = (
		db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }
	).n;
	if (userCount > 0) return c.json({ code: 400, message: "已初始化" }, 400);

	const body = await c.req.json().catch(() => ({}));
	const username = String(body.username || "").trim();
	const password = String(body.password || "");
	if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username))
		return c.json({ code: 422, message: "用户名需 3-32 位字母数字" }, 422);
	if (password.length < 8)
		return c.json({ code: 422, message: "密码至少 8 位" }, 422);

	const info = db
		.prepare(
			"INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, 'admin')",
		)
		.run(username, hashPassword(password), "站长");
	const session = createSession(username.length ? Number(info.lastInsertRowid) : 0, c.req.header("x-forwarded-for") || "127.0.0.1", c.req.header("user-agent") || "");
	const csrf = randomBytes(16).toString("hex");
	cookieSet(c, "ff_session", session.token, SESSION_TTL / 1000, true);
	cookieSet(c, "ff_csrf", csrf, SESSION_TTL / 1000, false);
	audit(Number(info.lastInsertRowid), "auth", "bootstrap", username, "ok", "", {
		ip: c.req.header("x-forwarded-for") || "",
		method: c.req.method,
	});
	return c.json({ ok: true, csrf });
});

authRouter.post("/api/v1/auth/login", async (c) => {
	const ip = c.req.header("x-forwarded-for") || "127.0.0.1";
	const body = await c.req.json().catch(() => ({}));
	const username = String(body.username || "");
	const password = String(body.password || "");
	const key = `${ip}:${username}`;
	if (rateLimited(key)) {
		audit(null, "auth", "login", username, "rate-limited", "", { ip, method: c.req.method });
		return c.json({ code: 429, message: "尝试过于频繁，请 15 分钟后再试" }, 429);
	}

	const user = db
		.prepare("SELECT id, username, nickname, role, password_hash FROM users WHERE username = ?")
		.get(username) as
		| { id: number; username: string; nickname: string; role: string; password_hash: string }
		| undefined;

	if (!user || !verifyPassword(password, user.password_hash)) {
		recordFail(key);
		audit(null, "auth", "login", username, "fail", "", { ip, method: c.req.method });
		return c.json({ code: 401, message: "用户名或密码错误" }, 401);
	}

	cleanSessions();
	const session = createSession(user.id, ip, c.req.header("user-agent") || "");
	const csrf = randomBytes(16).toString("hex");
	cookieSet(c, "ff_session", session.token, SESSION_TTL / 1000, true);
	cookieSet(c, "ff_csrf", csrf, SESSION_TTL / 1000, false);
	clearFails(key);
	audit(user.id, "auth", "login", username, "ok", `ip=${ip}`, { ip, method: c.req.method });
	return c.json({
		ok: true,
		csrf,
		user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
	});
});

authRouter.post("/api/v1/auth/logout", async (c) => {
	const token = c.get("sessionToken");
	if (token) {
		db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
		audit(c.get("user")?.id ?? null, "auth", "logout", c.get("user")?.username ?? "", "ok", "", {
			ip: c.req.header("x-forwarded-for") || "",
			method: c.req.method,
		});
	}
	cookieSet(c, "ff_session", "", 0, true);
	cookieSet(c, "ff_csrf", "", 0, false);
	return c.json({ ok: true });
});

// 登出等写操作走这里统一校验（在路由外由 index.ts 挂中间件，这里导出工具）
export { getSessionUser };
