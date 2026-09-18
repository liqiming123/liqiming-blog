# 看板娘 AI 聊天 —— 服务端代理

## 为什么不是前端直连

最初的设计是浏览器直连 DeepSeek（`apiEndpoint` 指向 `api.deepseek.com`）。问题在于这是静态站：
构建时 Key 会被烧进 HTML，**任何访客都能从源码里取走**，然后绕过本站直接调用 API。
「每天限 10 次」这类要求在前端**根本无法强制**——限额的计数器和 Key 都在用户手里。

所以改成服务端代理：Key 和计数都在服务器上。

## 链路

```
浏览器
  └─ POST https://liqiming.top/mascot-chat/chat/completions
       └─ OpenResty  location ^~ /mascot-chat/  →  127.0.0.1:8791
            └─ 代理服务（Python 3，/opt/mascot-chat/server.py）
                 ├─ 校验 Origin / Referer 必须来自本站
                 ├─ 校验并扣减每日额度（超限直接返回一句友好文案）
                 ├─ 强制模型与 max_tokens（防止前端放大成本）
                 └─ 转发 → https://api.deepseek.com/chat/completions
```

接口保持 **OpenAI 兼容格式**，所以前端逻辑不关心后端是谁；换模型或换供应商只改服务端配置。

## 服务器上的东西（不在本仓库）

| 路径 | 说明 |
|---|---|
| `/opt/mascot-chat/server.py` | 代理程序，Python 3 标准库，无第三方依赖 |
| `/opt/mascot-chat/config.json` | **含 API Key**，权限 `600`、属主 `mascotchat`，不要提交到任何仓库 |
| `/opt/mascot-chat/usage.json` | 当日用量，跨天自动归零，重启不丢 |
| `/etc/systemd/system/mascot-chat.service` | 开机自启，`MemoryMax=200M` |

以独立系统用户 `mascotchat` 运行；只监听 `127.0.0.1:8791`，不对外暴露端口。

## 常用操作

```bash
# 看今天用了几次
curl -s http://127.0.0.1:8791/health
# → {"ok": true, "date": "2026-09-17", "used": 3, "daily_limit": 10}

# 改限额：编辑 /opt/mascot-chat/config.json 的 daily_limit，然后
sudo systemctl restart mascot-chat

# 想立刻重置今天的次数（相当于放行）
sudo rm -f /opt/mascot-chat/usage.json && sudo systemctl restart mascot-chat

# 看日志
sudo journalctl -u mascot-chat -n 50 --no-pager

# 换 API Key / 换模型
sudo nano /opt/mascot-chat/config.json   # 改 api_key 或 model
sudo systemctl restart mascot-chat
```

## 配置项（config.json）

| 字段 | 说明 |
|---|---|
| `api_key` | DeepSeek 的 Key。**这是唯一存放处** |
| `upstream` | 上游对话接口，默认 DeepSeek。换成别的 OpenAI 兼容服务只改这里 |
| `model` | 实际使用的模型，会**覆盖**前端传来的 model |
| `daily_limit` | 每日总调用上限，**全站共享**，不是按人计 |
| `max_tokens` | 单次回复上限，前端传更大的值也会被压到这个数 |
| `timeout` | 上游超时秒数 |
| `allowed_origins` | 允许调用本接口的来源前缀，用于挡掉随手拿接口地址刷额度的人 |

## 已知的边界

- **全站共享 10 次**：这是按需求实现的，但意味着**一个人可以把当天的额度用光**。
  想更公平的话，可以再加一层按 IP 的小额度（比如每人每天 2 次）作为外层限制。
- **来源校验是软防护**：`Origin`/`Referer` 请求头可以伪造，它只挡随手滥用，不是安全边界。
  真正的边界是额度本身——即使被绕过，损失也封顶在每天 10 次。
- **上游失败会退还额度**：避免服务端问题白扣用户的次数。
- Key 一旦泄露（例如贴到聊天、提交进仓库），请立刻去 DeepSeek 控制台吊销并换新。
