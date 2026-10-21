import { Hono } from "hono";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pinyin } from "pinyin-pro";
import { audit } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BLOG_ROOT = process.env.BLOG_ROOT || resolve(__dirname, "../../");
const POSTS_DIR = join(BLOG_ROOT, "src/content/posts");
const DYNAMIC_DIR = join(BLOG_ROOT, "src/content/dynamic");
const GALLERY_JSON = join(BLOG_ROOT, "src/data/gallery.json");
const GALLERY_DIR = join(BLOG_ROOT, "public/gallery");
const UPLOADS_DIR = join(BLOG_ROOT, "public/uploads");

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const safeName = (s: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(s);

export const contentRouter = new Hono<any>();

// ── 文章 ─────────────────────────────────────────────
const slugFromTitle = (title: string): string => {
	const py = pinyin(title, { toneType: "none", type: "array", nonZh: "consecutive" })
		.join("-")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return safeName(py) ? py : `post-${Date.now()}`;
};

contentRouter.get("/api/v1/posts/:slug", (c) => {
	const file = join(POSTS_DIR, `${c.req.param("slug")}.md`);
	if (!existsSync(file)) return c.json({ code: 404, message: "文章不存在" }, 404);
	const { data, content } = matter(readFileSync(file, "utf8"));
	return c.json({ data, content });
});

contentRouter.post("/api/v1/posts", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const title = String(body.title || "").trim();
	const content = String(body.content || "");
	if (!title || !content) return c.json({ code: 422, message: "标题和正文必填" }, 422);

	const slug = body.slug ? String(body.slug) : slugFromTitle(title);
	if (!safeName(slug)) return c.json({ code: 422, message: "slug 只能含字母数字、-、_" }, 422);
	const file = join(POSTS_DIR, `${slug}.md`);
	if (existsSync(file)) return c.json({ code: 409, message: `文件 ${slug}.md 已存在` }, 409);

	// published 必须是 Date 对象再交给 gray-matter：字符串会被 YAML 序列化成带引号的
	// '2026-10-18'，而博客 schema（z.date()）要求的是无引号的 YAML 日期字面量
	const data: Record<string, any> = {
		title,
		published: new Date(body.published || Date.now()),
	};
	if (body.description) data.description = String(body.description);
	if (body.category) data.category = String(body.category);
	if (Array.isArray(body.tags) && body.tags.length) data.tags = body.tags;
	if (body.draft) data.draft = true;

	writeFileSync(file, matter.stringify(content, data));
	audit(c.get("user")?.id ?? null, "posts", "create", slug, "ok");
	return c.json({ ok: true, slug, url: `/posts/${slug}/` });
});

contentRouter.put("/api/v1/posts/:slug", async (c) => {
	const slug = c.req.param("slug");
	const file = join(POSTS_DIR, `${slug}.md`);
	if (!existsSync(file)) return c.json({ code: 404, message: "文章不存在" }, 404);

	const { data, content: original } = matter(readFileSync(file, "utf8"));
	// 加密文章的正文在构建期加密，盲目改写会让原密码失效（Phase 2 支持整文重加密后再开放）
	if (data.password) {
		audit(c.get("user")?.id ?? null, "posts", "edit-refused", slug, "encrypted");
		return c.json({ code: 422, message: "加密文章暂不支持在线编辑（将在后续阶段支持）" }, 422);
	}

	const body = await c.req.json().catch(() => ({}));
	const merged = { ...data };
	if (body.title !== undefined) merged.title = String(body.title);
	if (body.category !== undefined) merged.category = String(body.category);
	if (body.tags !== undefined) merged.tags = body.tags;
	if (body.description !== undefined) merged.description = String(body.description);
	if (body.draft !== undefined) merged.draft = Boolean(body.draft);
	if (body.published !== undefined) merged.published = new Date(body.published);
	// 兼容历史文件里的字符串日期（防止再次序列化成带引号的形式）
	if (typeof merged.published === "string") merged.published = new Date(merged.published);

	const content = body.content !== undefined ? String(body.content) : original;
	writeFileSync(file, matter.stringify(content, merged));
	audit(c.get("user")?.id ?? null, "posts", "update", slug, "ok");
	return c.json({ ok: true });
});

// ── 说说（对齐 new-dynamic.js：Asia/Shanghai 时间戳文件名 + published/location）──
const shanghaiNow = () => {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
	}).formatToParts(new Date());
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
	return {
		file: `${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}${get("second")}.md`,
		published: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`,
	};
};

contentRouter.get("/api/v1/dynamic", (c) => {
	const items = readdirSync(DYNAMIC_DIR)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.reverse()
		.map((f) => {
			const { data, content } = matter(readFileSync(join(DYNAMIC_DIR, f), "utf8"));
			// published 解析出来是 Date：按东八区格式化成统一的 YYYY-MM-DD HH:mm:ss
			const d = data.published instanceof Date ? data.published : new Date(String(data.published ?? ""));
			const fmt = new Intl.DateTimeFormat("en-CA", {
				timeZone: "Asia/Shanghai",
				year: "numeric", month: "2-digit", day: "2-digit",
				hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
			}).format(d).replace(",", "");
			return {
				file: f,
				published: fmt,
				location: String(data.location ?? ""),
				pinned: Boolean(data.pinned),
				preview: content.trim().slice(0, 120),
			};
		});
	return c.json({ items });
});

contentRouter.post("/api/v1/dynamic", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const content = String(body.content || "").trim();
	if (!content) return c.json({ code: 422, message: "说点什么吧" }, 422);
	const { file, published } = shanghaiNow();
	// 同文章：给 YAML 的是 Date 对象（Asia/Shanghai 时刻），不是字符串
	const data: Record<string, any> = {
		published: new Date(published.replace(" ", "T") + "+08:00"),
	};
	if (body.location) data.location = String(body.location);
	if (body.pinned) data.pinned = true;
	writeFileSync(join(DYNAMIC_DIR, file), matter.stringify(content, data));
	audit(c.get("user")?.id ?? null, "dynamic", "create", file, "ok");
	return c.json({ ok: true, file });
});

contentRouter.delete("/api/v1/dynamic/:file", (c) => {
	const file = c.req.param("file");
	if (!/^\d{4}-\d{2}-\d{2}-\d{6}\.md$/.test(file)) return c.json({ code: 422 }, 422);
	const full = join(DYNAMIC_DIR, file);
	if (!existsSync(full)) return c.json({ code: 404 }, 404);
	unlinkSync(full);
	audit(c.get("user")?.id ?? null, "dynamic", "delete", file, "ok");
	return c.json({ ok: true });
});

// ── 相册（数据源 src/data/gallery.json，图片 public/gallery/<id>/）──
type Album = { id: string; name: string; description?: string; location?: string; date?: string; tags?: string[] };

const readGallery = () => JSON.parse(readFileSync(GALLERY_JSON, "utf8"));
const writeGallery = (g: any) => writeFileSync(GALLERY_JSON, JSON.stringify(g, null, "\t") + "\n");

const albumPhotos = (id: string): string[] => {
	const dir = join(GALLERY_DIR, id);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => IMG_EXT.has(f.slice(f.lastIndexOf(".")).toLowerCase()))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

contentRouter.get("/api/v1/gallery", (c) => {
	const g = readGallery();
	const albums = (g.albums ?? []).map((a: Album) => ({
		...a,
		photos: albumPhotos(a.id).map((f) => `/gallery/${a.id}/${f}`),
	}));
	// 目录里存在但未登记的相册目录（如上游示例 firefly-2026）
	const known = new Set(albums.map((a: any) => a.id));
	const orphanDirs = readdirSync(GALLERY_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && !known.has(d.name))
		.map((d) => ({ id: d.name, photos: albumPhotos(d.name).length }));
	return c.json({ albums, orphanDirs, columnWidth: g.columnWidth ?? 240 });
});

contentRouter.post("/api/v1/gallery/albums", async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const id = String(body.id || "").trim();
	if (!safeName(id)) return c.json({ code: 422, message: "相册 id 只能含字母数字、-、_" }, 422);
	const g = readGallery();
	if ((g.albums ?? []).some((a: Album) => a.id === id))
		return c.json({ code: 409, message: "相册 id 已存在" }, 409);

	const album: Album = {
		id,
		name: String(body.name || id),
		description: String(body.description || ""),
		location: String(body.location || ""),
		date: String(body.date || new Date().toISOString().slice(0, 10)),
		tags: Array.isArray(body.tags) ? body.tags : [],
	};
	g.albums.push(album);
	writeGallery(g);
	mkdirSync(join(GALLERY_DIR, id), { recursive: true });
	audit(c.get("user")?.id ?? null, "gallery", "create-album", id, "ok");
	return c.json({ ok: true });
});

contentRouter.post("/api/v1/gallery/:id/photos", async (c) => {
	const id = c.req.param("id");
	if (!safeName(id) || !existsSync(join(GALLERY_DIR, id)))
		return c.json({ code: 404, message: "相册不存在（先创建相册）" }, 404);

	// all:true 才能把同名多文件字段收成数组，否则只拿到最后一个
	const body = await c.req.parseBody({ all: true });
	const files = (Array.isArray(body.files) ? body.files : [body.files]).filter(
		(f): f is File => f instanceof File,
	);
	if (!files.length) return c.json({ code: 422, message: "没有收到文件" }, 422);

	const existing = albumPhotos(id);
	let next = existing.length + 1;
	const saved: string[] = [];
	for (const f of files) {
		const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
		if (!IMG_EXT.has(ext)) return c.json({ code: 422, message: `不支持的格式 ${ext}` }, 422);
		if (f.size > 10 * 1024 * 1024) return c.json({ code: 422, message: `${f.name} 超过 10MB` }, 422);
		const name = `${next}${ext}`;
		writeFileSync(join(GALLERY_DIR, id, name), Buffer.from(await f.arrayBuffer()));
		saved.push(`/gallery/${id}/${name}`);
		next += 1;
	}
	audit(c.get("user")?.id ?? null, "gallery", "upload-photos", id, `ok(${saved.length})`);
	return c.json({ ok: true, urls: saved });
});

// ── 通用图片上传（文章/说说插图 → public/uploads/YYYY-MM/）──
contentRouter.post("/api/v1/upload", async (c) => {
	const body = await c.req.parseBody();
	const file = body.file;
	if (!(file instanceof File)) return c.json({ code: 422, message: "没有收到文件" }, 422);
	const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
	if (!IMG_EXT.has(ext)) return c.json({ code: 422, message: `不支持的格式 ${ext}` }, 422);
	if (file.size > 10 * 1024 * 1024) return c.json({ code: 422, message: "超过 10MB" }, 422);

	const now = new Date();
	const dir = join(UPLOADS_DIR, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
	mkdirSync(dir, { recursive: true });
	const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
	writeFileSync(join(dir, name), Buffer.from(await file.arrayBuffer()));
	audit(c.get("user")?.id ?? null, "upload", "image", name, "ok");
	return c.json({ ok: true, url: `/uploads/${dir.split("/").pop()}/${name}` });
});
