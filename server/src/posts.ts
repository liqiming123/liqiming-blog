import { Hono } from "hono";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 线上部署时 BLOG_ROOT 指向服务器上的博客内容镜像
const BLOG_ROOT = process.env.BLOG_ROOT || resolve(__dirname, "../../");
const POSTS_DIR = resolve(BLOG_ROOT, "src/content/posts");

export type PostMeta = {
	slug: string;
	title: string;
	category: string;
	tags: string[];
	pubDate: string;
	draft: boolean;
	encrypted: boolean;
	words: number;
};

// frontmatter 的 published 解析出来是 Date，按东八区格式化成 YYYY-MM-DD
const fmtDate = (v: any): string => {
	if (!v) return "";
	const d = v instanceof Date ? v : new Date(String(v));
	if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

export function scanPosts(): PostMeta[] {
	const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
	const posts: PostMeta[] = [];
	for (const file of files) {
		try {
			const raw = readFileSync(resolve(POSTS_DIR, file), "utf8");
			const { data, content } = matter(raw);
			const tags: string[] = Array.isArray(data.tags)
				? data.tags.map(String)
				: typeof data.tags === "string"
					? [data.tags]
					: [];
			posts.push({
				slug: file.replace(/\.md$/, ""),
				title: String(data.title ?? file),
				category: String(data.category ?? "未分类"),
				tags,
				pubDate: fmtDate(data.published),
				draft: Boolean(data.draft),
				encrypted: Boolean(data.password),
				words: content.replace(/\s/g, "").length,
			});
		} catch {
			// 单篇解析失败不拖垮整个列表
		}
	}
	return posts.sort((a, b) => (a.pubDate < b.pubDate ? 1 : -1));
}

export const postsRouter = new Hono();

postsRouter.get("/api/v1/posts", (c) => {
	const posts = scanPosts();
	const q = c.req.query("q")?.toLowerCase() ?? "";
	const filtered = q
		? posts.filter(
				(p) =>
					p.title.toLowerCase().includes(q) ||
					p.tags.some((t) => t.toLowerCase().includes(q)),
			)
		: posts;
	return c.json({ total: filtered.length, posts: filtered });
});
