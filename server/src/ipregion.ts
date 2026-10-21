// ip2region 离线 IP 库（服务器 npm 装 ip2region 包，含内置 xdb）。
// 包不可用（本地无依赖）时静默降级返回 null，统计记为"未知"。
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
let query: any = null;
try {
	const mod = require_("ip2region");
	const IP2Region = (mod as any).default || mod;
	query = new IP2Region();
} catch {
	query = null;
}

const cache = new Map<string, string>();

export function lookupArea(ip: string): string | null {
	if (!query || !ip) return null;
	if (cache.has(ip)) return cache.get(ip) as string;
	try {
		const r = query.search(ip);
		let area: string | null = null;
		if (r?.country && r.country !== "中国") {
			area = r.country; // 海外：国家名
		} else if (r?.province) {
			// 省份归一化：江苏省→江苏、北京市→北京、广西壮族自治区→广西
			const province = r.province
				.replace(/(特别行政区|自治区|维吾尔|壮族|回族)/g, "")
				.replace(/省$/, "")
				.replace(/市$/, "");
			// 城市归一化：盐城市→盐城；"0"/市辖区/空 视为无城市
			const city = String(r?.city || "")
				.replace(/市$/, "")
				.trim();
			area = city && city !== "0" && city !== "市辖区" && city !== province ? `${province}·${city}` : province;
		}
		if (area) cache.set(ip, area);
		return area;
	} catch {
		return null;
	}
}
