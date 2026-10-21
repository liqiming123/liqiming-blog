// 演示数据种子：本地预览用。生成 90 天自建访客统计（UV/PV/地域/热门内容）。
// 上线 Server 模式前清空 stats 表，改为真实埋点积累。
import { db, setMeta, tx } from "./db.js";
import { scanPosts } from "./posts.js";

// 中国省份 + 海外国家的权重（贴近个人技术博客的真实分布：沿海+一线为主）
const AREA_WEIGHTS: [string, number][] = [
	["广东", 70], ["江苏", 42], ["北京", 55], ["上海", 48], ["浙江", 38],
	["四川", 22], ["湖北", 18], ["山东", 17], ["福建", 16], ["河南", 14],
	["陕西", 13], ["重庆", 11], ["湖南", 11], ["辽宁", 8], ["河北", 8],
	["天津", 7], ["江西", 6], ["安徽", 6], ["广西", 5], ["云南", 4],
	["黑龙江", 3], ["山西", 3], ["贵州", 3], ["内蒙古", 2], ["吉林", 2],
	["甘肃", 2], ["海南", 2], ["新疆", 2], ["美国", 10], ["日本", 7],
	["新加坡", 5], ["德国", 3], ["英国", 3], ["加拿大", 3], ["澳大利亚", 2],
	["韩国", 3], ["法国", 2], ["其他海外", 6],
];
const TOTAL_WEIGHT = AREA_WEIGHTS.reduce((s, [, w]) => s + w, 0);
const pickArea = (): string => {
	let r = Math.random() * TOTAL_WEIGHT;
	for (const [name, w] of AREA_WEIGHTS) {
		r -= w;
		if (r <= 0) return name;
	}
	return "广东";
};

// 与真实接近的文章热度分布：头部效应明显
const HOTNESS = [1, 0.72, 0.55, 0.44, 0.36, 0.3, 0.26, 0.22, 0.19, 0.17, 0.15, 0.13, 0.11, 0.1, 0.09];

const dateStr = (offset: number): string => {
	const d = new Date();
	d.setDate(d.getDate() - offset);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const DAYS = 90;

const totalViews = tx(() => {
		db.prepare("DELETE FROM daily_visitors").run();
		db.prepare("DELETE FROM page_views").run();
		db.prepare("DELETE FROM visitor_areas").run();
		db.prepare("DELETE FROM meta WHERE key = 'total_views'").run();

		const posts = scanPosts();
		if (posts.length === 0) throw new Error("未扫描到文章，请确认 src/content/posts");
		const seedFp = db.prepare("INSERT OR IGNORE INTO daily_visitors (date, fingerprint, area) VALUES (?, ?, ?)");
		const areaUp = db.prepare(
			"INSERT INTO visitor_areas (date, area, count) VALUES (?, ?, 1) ON CONFLICT(date, area) DO UPDATE SET count = count + 1",
		);
		const pvUp = db.prepare(
			"INSERT INTO page_views (date, path, title, views) VALUES (?, ?, ?, ?) ON CONFLICT(date, path) DO UPDATE SET views = views + excluded.views",
		);

		let totalViews = 0;
		for (let i = DAYS - 1; i >= 0; i--) {
			const date = dateStr(i);
			const weekday = new Date(date).getDay();
			const weekendFactor = weekday === 0 || weekday === 6 ? 0.78 : 1;
			const growth = 1 + (DAYS - i) / DAYS * 0.8; // 三个月缓慢爬坡
			const noise = 0.85 + Math.random() * 0.3;
			const uv = Math.max(6, Math.round(42 * weekendFactor * growth * noise));

			// 地域分布（每个 UV 一次归属地抽样）
			for (let v = 0; v < uv; v++) {
				const area = pickArea();
				seedFp.run(date, `seed-${date}-${v}`, area);
				areaUp.run(date, area);
			}

			// PV：UV × 1.8~2.5，落到具体文章（按热度权重）
			const pvTotal = Math.round(uv * (1.8 + Math.random() * 0.7));
			totalViews += pvTotal;
			let assigned = 0;
			for (let p = 0; p < posts.length && assigned < pvTotal; p++) {
				const weight = HOTNESS[p] ?? 0.08;
				const views = p === posts.length - 1 ? pvTotal - assigned : Math.round(pvTotal * weight * (0.8 + Math.random() * 0.4));
				if (views <= 0) continue;
				pvUp.run(date, `/posts/${posts[p].slug}/`, posts[p].title, views);
				assigned += views;
			}
		}
		setMeta("total_views", String(totalViews));
		return totalViews;
});

console.log(`已生成 ${DAYS} 天演示数据，总浏览量 ${totalViews.toLocaleString()}`);
