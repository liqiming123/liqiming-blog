import { Hono } from "hono";
import { createHash } from "node:crypto";
import { db, today, getMeta, setMeta } from "./db.js";
import { lookupArea } from "./ipregion.js";

// ── 自建访客统计（对齐 aurora 的 /report 设计：IP+UA 指纹去重，不存明文 IP）──
export const statsRouter = new Hono();

// 埋点接口会被前台页面跨端口（dev 4321 → server 4322）调用，放开匿名 CORS
statsRouter.use("/api/v1/report", async (c, next) => {
	c.header("Access-Control-Allow-Origin", "*");
	if (c.req.method === "OPTIONS") {
		c.header("Access-Control-Allow-Headers", "content-type");
		c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
		return c.body(null, 204);
	}
	await next();
});

// 简单限流：每 IP 每分钟 60 次
const reportHits = new Map<string, { count: number; resetAt: number }>();
const allowReport = (ip: string): boolean => {
	const now = Date.now();
	const entry = reportHits.get(ip);
	if (entry && entry.resetAt > now) {
		if (entry.count >= 60) return false;
		entry.count += 1;
		return true;
	}
	reportHits.set(ip, { count: 1, resetAt: now + 60_000 });
	return true;
};

// 地域解析：内网直接归"本地"；公网 IP 的省市解析在部署时接 ip2region（xdb 离线库），
// 本地开发拿到的都是 127.0.0.1，返回 null 记为未识别。
const resolveArea = (ip: string): string | null => {
	if (!ip || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "::1")
		return "本地";
	if (ip.startsWith("172.")) {
		const second = Number(ip.split(".")[1]);
		if (second >= 16 && second <= 31) return "本地";
	}
	return lookupArea(ip) ?? null;
};

statsRouter.post("/api/v1/report", async (c) => {
	// 本地恒为回环；生产在 OpenResty 反代后 X-Forwarded-For 必带
	const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
	if (!allowReport(ip)) return c.json({ ok: false }, 429);

	const ua = c.req.header("user-agent") || "";
	const body = await c.req.json().catch(() => ({}));
	const path = String(body.path || "/").slice(0, 200);
	const title = String(body.title || "").slice(0, 200);

	const fingerprint = createHash("md5").update(`${ip}|${ua}`).digest("hex");
	const date = today();

	// UV：当日首次出现的指纹
	const area = resolveArea(ip) ?? "未知";
	const uvInsert = db
		.prepare("INSERT OR IGNORE INTO daily_visitors (date, fingerprint, area) VALUES (?, ?, ?)")
		.run(date, fingerprint, area);

	// 地域计数（无论新老访客，每次都按访客的归属地+1？不——aurora 的做法是新访客才累计地域，
	// 这里对齐：仅当日新指纹累计，避免刷新灌水）
	if (uvInsert.changes === 1) {
		db.prepare(
			`INSERT INTO visitor_areas (date, area, count) VALUES (?, ?, 1)
			 ON CONFLICT(date, area) DO UPDATE SET count = count + 1`,
		).run(date, area);
	}

	// PV：按路径累计（用于热门内容）
	db.prepare(
		`INSERT INTO page_views (date, path, title, views) VALUES (?, ?, ?, 1)
		 ON CONFLICT(date, path) DO UPDATE SET views = views + 1, title = excluded.title`,
	).run(date, path, title);

	const total = Number(getMeta("total_views") || 0) + 1;
	setMeta("total_views", String(total));

	return c.json({ ok: true });
});
