// 发布管线：内容写操作成功后触发服务器上的完整构建+原子发布。
// 单飞 + 排队合并：构建进行中来的新触发会在本轮结束后再补一轮。
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";

const SCRIPT = "/opt/firefly-admin/scripts/deploy.sh";
const LOG = "/opt/firefly-admin/logs/build.log";
let running = false;
let queued = false;

export function triggerBuild(reason = "") {
	if (!existsSync(SCRIPT)) return; // 本地开发没有部署脚本，静默跳过
	if (running) {
		queued = true;
		return;
	}
	running = true;
	try {
		mkdirSync("/opt/firefly-admin/logs", { recursive: true });
		appendFileSync(LOG, `[${new Date().toISOString()}] 触发构建：${reason}\n`);
	} catch {}
	const child = spawn(SCRIPT, [], { detached: true, stdio: "ignore" });
	child.unref();
	const finish = () => {
		running = false;
		if (queued) {
			queued = false;
			setTimeout(() => triggerBuild(reason + "(queued)"), 3000);
		}
	};
	child.on("exit", finish);
	child.on("error", finish);
}
