import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Node 24 内置 node:sqlite（DatabaseSync），零原生依赖，
// 替代 better-sqlite3（后者在 Node 24.19 的 GC 回收 Statement 时有原生断言崩溃）
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(resolve(DATA_DIR, "admin.db"));
db.exec("PRAGMA journal_mode = WAL");

// 简易事务（node:sqlite 没有 db.transaction 包装，等价实现）
export const tx = (fn: () => any) => {
	db.exec("BEGIN");
	try {
		const result = fn();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'admin',
  avatar TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ip TEXT,
  ua TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  result TEXT NOT NULL,
  detail TEXT DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS exception_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opt_uri TEXT NOT NULL DEFAULT '',
  opt_desc TEXT NOT NULL DEFAULT '',
  request_method TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  ip_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 自建访客统计（对齐 aurora 的 t_unique_view / VISITOR_AREA / ARTICLE_VIEWS 设计）
CREATE TABLE IF NOT EXISTS daily_visitors (
  date TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  area TEXT,
  UNIQUE(date, fingerprint)
);

CREATE TABLE IF NOT EXISTS page_views (
  date TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, path)
);

CREATE TABLE IF NOT EXISTS visitor_areas (
  date TEXT NOT NULL,
  area TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, area)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 预注册的分类/标签：后台直接添加、尚未被任何文章引用时存这里；文章派生的部分实时扫描
CREATE TABLE IF NOT EXISTS taxonomies (
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(kind, name)
);
`);

// 既有库补列（aurora 协议的 users.avatar/email/intro，建表语句后加的，老库 CREATE IF NOT EXISTS 不会补）
for (const [col, ddl] of [
	["avatar", "TEXT NOT NULL DEFAULT ''"],
	["email", "TEXT NOT NULL DEFAULT ''"],
	["intro", "TEXT NOT NULL DEFAULT ''"],
] as const) {
	const has = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).some((c) => c.name === col);
	if (!has) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${ddl}`);
}

// audit_logs 的 ip/method 同理：老库补列，历史行保持空串（前台显示 -）
for (const [col, ddl] of [
	["ip", "TEXT NOT NULL DEFAULT ''"],
	["method", "TEXT NOT NULL DEFAULT ''"],
] as const) {
	const has = (db.prepare(`PRAGMA table_info(audit_logs)`).all() as { name: string }[]).some((c) => c.name === col);
	if (!has) db.exec(`ALTER TABLE audit_logs ADD COLUMN ${col} ${ddl}`);
}

export function getMeta(key: string): string | null {
	const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
		| { value: string }
		| undefined;
	return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
	db.prepare(
		"INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
	).run(key, value);
}

export function today(): string {
	// 服务器本地时区的自然日（部署在东八区；本地开发也是）
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
