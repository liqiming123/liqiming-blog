import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

// 密码与 session 的底层工具（auth.ts 与 aurora.ts 共用）
export const hashPassword = (password: string): string => {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(password, salt, 64).toString("hex");
	return `scrypt$${salt}$${hash}`;
};

export const verifyPassword = (password: string, user: any): boolean => {
	const stored = user?.password_hash;
	if (!stored) return false;
	const [algo, salt, hash] = String(stored).split("$");
	if (algo !== "scrypt" || !salt || !hash) return false;
	const candidate = scryptSync(password, salt, 64);
	const expected = Buffer.from(hash, "hex");
	return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const createSessionFor = (userId: number, ua: string, ip = "127.0.0.1"): string => {
	const token = randomBytes(32).toString("hex");
	db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)").run(
		token, userId, Date.now() + 7 * 24 * 3600 * 1000, Date.now(), ip, ua,
	);
	return token;
};
