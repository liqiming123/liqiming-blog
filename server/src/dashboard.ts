import { Hono } from "hono";
import { db, today, getMeta } from "./db.js";
import { scanPosts } from "./posts.js";
import type { Env } from "./auth.js";

// ── 仪表盘聚合：全部数字来自本库真实表 + 内容扫描，禁止假数据 ──
export const dashboardRouter = new Hono<Env>();

const dateRange = (days: number): string[] => {
	const out: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
	}
	return out;
};

dashboardRouter.get("/api/v1/admin/dashboard", (c) => {
	const days = Math.min(Number(c.req.query("days") || 7), 90);
	const range = dateRange(days);
	const placeholders = range.map(() => "?").join(",");

	const uvRows = db
		.prepare(
			`SELECT date, COUNT(*) AS n FROM daily_visitors WHERE date IN (${placeholders}) GROUP BY date`,
		)
		.all(...range) as { date: string; n: number }[];
	const pvRows = db
		.prepare(
			`SELECT date, SUM(views) AS n FROM page_views WHERE date IN (${placeholders}) GROUP BY date`,
		)
		.all(...range) as { date: string; n: number | null }[];
	const uvMap = new Map(uvRows.map((r) => [r.date, r.n]));
	const pvMap = new Map(pvRows.map((r) => [r.date, r.n ?? 0]));

	const posts = scanPosts();
	const catCount = new Map<string, number>();
	const tagCount = new Map<string, number>();
	for (const p of posts) {
		catCount.set(p.category, (catCount.get(p.category) ?? 0) + 1);
		for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
	}

	const top = db
		.prepare(
			`SELECT path, MAX(title) AS title, SUM(views) AS views FROM page_views
			 WHERE path LIKE '/posts/%' GROUP BY path ORDER BY views DESC LIMIT 5`,
		)
		.all() as { path: string; title: string; views: number }[];

	const areas = db
		.prepare("SELECT area, SUM(count) AS value FROM visitor_areas GROUP BY area ORDER BY value DESC")
		.all() as { area: string; value: number }[];

	const recentAudit = db
		.prepare(
			"SELECT module, action, target, result, created_at FROM audit_logs ORDER BY id DESC LIMIT 6",
		)
		.all() as { module: string; action: string; target: string; result: string; created_at: string }[];

	return c.json({
		totals: {
			views: Number(getMeta("total_views") || 0),
			uvToday: (
				db.prepare("SELECT COUNT(*) AS n FROM daily_visitors WHERE date = ?").get(today()) as { n: number }
			).n,
			posts: posts.length,
			auditEvents: (
				db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get() as { n: number }
			).n,
		},
		trend: {
			dates: range,
			uv: range.map((d) => uvMap.get(d) ?? 0),
			pv: range.map((d) => pvMap.get(d) ?? 0),
		},
		topArticles: top.map((t) => ({
			title: t.title || t.path,
			path: t.path,
			views: t.views,
		})),
		categories: [...catCount.entries()].map(([name, value]) => ({ name, value })),
		tags: [...tagCount.entries()]
			.map(([name, value]) => ({ name, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 24),
		areas,
		recentAudit,
	});
});
