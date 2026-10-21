// Artalk 评论对接：列表直读同机 artalk.db（只读、零认证），写操作走 HTTP API（机器人管理员）
// 配置（server/.env）：ARTALK_BASE_URL / ARTALK_BOT_EMAIL / ARTALK_BOT_PASSWORD
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

const BASE = process.env.ARTALK_BASE_URL || "";
const BOT_EMAIL = process.env.ARTALK_BOT_EMAIL || "";
const BOT_PASSWORD = process.env.ARTALK_BOT_PASSWORD || "";
const ARTALK_DB = process.env.ARTALK_DB_PATH || "/opt/artalk/artalk.db";

export type AdminCommentRow = {
	objectId: number;
	nick: string;
	mail: string;
	link: string;
	url: string;
	site: string;
	comment: string;
	orig: string;
	status: "approved" | "waiting" | "spam";
	time: string;
	guest: boolean;
	rid: number;
	sticky: boolean;
	reply_user: { nick: string } | null;
};

// ── HTTP API（写操作）──────────────────────────────────────────
let cachedToken: { token: string; exp: number } | null = null;

async function apiToken(): Promise<string> {
	if (!BASE) throw new Error("评论服务未配置（ARTALK_BASE_URL）");
	if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
	const res = await fetch(`${BASE}/api/v2/auth/email/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
	});
	const j: any = await res.json().catch(() => ({}));
	if (!j.token) throw new Error(`Artalk 登录失败: ${j.msg || res.status}`);
	cachedToken = { token: j.token, exp: Date.now() + 3600_000 };
	return j.token;
}

async function artalk(method: string, path: string, body?: unknown): Promise<any> {
	const token = await apiToken();
	const res = await fetch(BASE + path, {
		method,
		headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const j: any = await res.json().catch(() => ({}));
	if (!res.ok) {
		// token 过期重登一次再试
		if (res.status === 401 && cachedToken) {
			cachedToken = null;
			return artalk(method, path, body);
		}
		throw new Error(j.msg || `Artalk ${res.status}`);
	}
	return j;
}

// ── 列表（直读 SQLite）─────────────────────────────────────────
const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const toHtml = (md: string) =>
	md
		.split(/\n{2,}/)
		.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
		.join("\n");

const statusOf = (r: any): AdminCommentRow["status"] =>
	r.is_collapsed ? "spam" : r.is_pending ? "waiting" : "approved";

function queryAll(): AdminCommentRow[] {
	if (!existsSync(ARTALK_DB)) return [];
	const d = new DatabaseSync(ARTALK_DB, { readOnly: true });
	try {
		const rows = d
			.prepare(
				`SELECT c.id, c.content, c.page_key, c.site_name, c.rid, c.is_pending, c.is_pinned, c.is_collapsed, c.created_at,
					u.name AS nick, u.email AS mail, u.link, u.is_admin,
					pu.name AS parent_nick
				FROM comments c
				JOIN users u ON u.id = c.user_id
				LEFT JOIN comments p ON p.id = c.rid
				LEFT JOIN users pu ON pu.id = p.user_id
				WHERE c.deleted_at IS NULL`,
			)
			.all() as any[];
		return rows.map((r) => ({
			objectId: Number(r.id),
			nick: String(r.nick || ""),
			mail: String(r.mail || ""),
			link: String(r.link || ""),
			url: String(r.page_key || ""),
			site: String(r.site_name || ""),
			comment: toHtml(String(r.content || "")),
			orig: String(r.content || ""),
			status: statusOf(r),
			time: String(r.created_at || "").slice(0, 19),
			guest: !r.is_admin,
			rid: Number(r.rid || 0),
			sticky: Boolean(r.is_pinned),
			reply_user: r.parent_nick ? { nick: String(r.parent_nick) } : null,
		}));
	} finally {
		d.close();
	}
}

export function listComments(opts: { status?: string; keyword?: string; page: number; pageSize: number }) {
	let rows = queryAll();
	if (opts.status) rows = rows.filter((r) => r.status === opts.status);
	if (opts.keyword) {
		const kw = opts.keyword.toLowerCase();
		rows = rows.filter(
			(r) => r.nick.toLowerCase().includes(kw) || r.orig.toLowerCase().includes(kw) || r.url.toLowerCase().includes(kw),
		);
	}
	const pageSize = Math.max(1, opts.pageSize);
	const count = rows.length;
	const start = (Math.max(1, opts.page) - 1) * pageSize;
	return { rows: rows.slice(start, start + pageSize), count, page: opts.page, totalPages: Math.max(1, Math.ceil(count / pageSize)) };
}

export const pendingCount = (): number => queryAll().filter((r) => r.status === "waiting").length;
export const totalComments = (): number => queryAll().length;

// 仪表盘统计：Artalk 注册用户数与留言（评论）数；本地无 artalk.db 时返回 0
export function artalkStats(): { users: number; comments: number } {
	if (!existsSync(ARTALK_DB)) return { users: 0, comments: 0 };
	const d = new DatabaseSync(ARTALK_DB, { readOnly: true });
	try {
		const users = (d.prepare("SELECT COUNT(*) n FROM users").get() as any).n;
		const comments = (d.prepare("SELECT COUNT(*) n FROM comments WHERE deleted_at IS NULL").get() as any).n;
		return { users: Number(users), comments: Number(comments) };
	} finally {
		d.close();
	}
}

// ── 写操作（走 API）────────────────────────────────────────────
function rawRow(id: number): any {
	if (!existsSync(ARTALK_DB)) return null;
	const d = new DatabaseSync(ARTALK_DB, { readOnly: true });
	try {
		return d
			.prepare(
				"SELECT c.*, u.name AS nick, u.email AS email FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.deleted_at IS NULL",
			)
			.get(id);
	} finally {
		d.close();
	}
}

// 回复：以机器人管理员身份发一条子评论
export async function replyComment(targetId: number, content: string) {
	const target = rawRow(targetId);
	if (!target) throw new Error("原评论不存在");
	return artalk("POST", "/api/v2/comments", {
		name: "firefly-admin",
		email: BOT_EMAIL,
		content,
		page_key: target.page_key,
		site_name: target.site_name,
		rid: targetId,
	});
}

// 更新：PUT 是全量替换语义——从库里读全量字段，合并变更后提交
export async function updateComment(id: number, patch: { status?: string; sticky?: number; comment?: string }) {
	const r = rawRow(id);
	if (!r) throw new Error("评论不存在");
	const hasStatus = patch.status !== undefined;
	return artalk("PUT", `/api/v2/comments/${id}`, {
		site_name: r.site_name,
		page_key: r.page_key,
		rid: Number(r.rid || 0),
		content: patch.comment !== undefined ? patch.comment : r.content,
		is_collapsed: hasStatus ? patch.status === "spam" : Boolean(r.is_collapsed),
		is_pending: hasStatus ? patch.status === "waiting" : Boolean(r.is_pending),
		is_pinned: patch.sticky !== undefined ? Boolean(patch.sticky) : Boolean(r.is_pinned),
		nick: r.nick,
		email: r.email,
	});
}

export async function deleteComment(id: number) {
	return artalk("DELETE", `/api/v2/comments/${id}`);
}

// ── 站长邮件通知开关（作用于该邮箱下的所有 Artalk 用户）──────────
export function getNotifyState(email: string): boolean {
	if (!existsSync(ARTALK_DB)) return false;
	const d = new DatabaseSync(ARTALK_DB, { readOnly: true });
	try {
		const rows = d
			.prepare("SELECT receive_email FROM users WHERE email = ? AND deleted_at IS NULL")
			.all(email) as { receive_email: number }[];
		return rows.some((r) => Number(r.receive_email) === 1);
	} finally {
		d.close();
	}
}

export async function setNotifyState(email: string, enabled: boolean): Promise<void> {
	const j = await artalk("GET", `/api/v2/users?limit=100&offset=0`);
	const users = (j.users || []).filter((u: any) => u.email === email);
	for (const u of users) {
		// PUT 为全量替换：带齐 name/email/is_admin/receive_email
		await artalk("PUT", `/api/v2/users/${u.id}`, {
			name: u.name,
			email: u.email,
			is_admin: Boolean(u.is_admin),
			receive_email: enabled,
		});
	}
}

// ── Artalk 注册用户（后台用户管理/角色管理数据源）──────────────
// 直读 artalk.db（含每人评论数）；本地无库时返回空数组
export function artalkMembers(): Array<{
	id: number;
	name: string;
	email: string;
	is_admin: number;
	receive_email: number;
	created_at: string;
	comments: number;
}> {
	if (!existsSync(ARTALK_DB)) return [];
	const d = new DatabaseSync(ARTALK_DB, { readOnly: true });
	try {
		return d
			.prepare(
				`SELECT u.id, u.name, u.email, u.is_admin, u.receive_email, u.created_at,
					(SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.deleted_at IS NULL) AS comments
				FROM users u
				ORDER BY u.is_admin DESC, comments DESC, u.id`,
			)
			.all() as any;
	} finally {
		d.close();
	}
}

// 切换 Artalk 用户的管理员身份（走 API，PUT 全量替换语义）
export async function setArtalkAdmin(id: number, isAdmin: boolean): Promise<void> {
	const j = await artalk("GET", `/api/v2/users?limit=100&offset=0`);
	const u = (j.users || []).find((x: any) => Number(x.id) === Number(id));
	if (!u) throw new Error("Artalk 用户不存在");
	await artalk("PUT", `/api/v2/users/${id}`, {
		name: u.name,
		email: u.email,
		is_admin: isAdmin,
		receive_email: Boolean(u.receive_email),
	});
}

