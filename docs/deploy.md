# 部署到自建服务器（liqiming.top）

线上不是 Vercel，是**腾讯云 Lighthouse 服务器**上的 OpenResty 提供静态文件。
本文以演示站为例说明静态托管方式。服务器地址、SSH 私钥、后端配置与数据库不随仓库提供。

## ⚠️ 只跑 `astro build` 会漏掉三步

`pnpm build` 后面的三步**不是可选的**，跳过会出真实故障：

| 步骤 | 跳过会怎样 |
|---|---|
| `prune-pio-assets.ts` | 白传 9 MB 用不到的资源（配置里关掉的 mascot 模型） |
| `minify-inline-scripts.ts` | 多传约 1.1 MB 内联脚本 |
| `run-pagefind.ts` | **站内搜索直接是坏的**（没有索引文件） |

## 完整部署流程

使用 Node.js 24 和项目锁定的 pnpm 版本。命令中的 `YOUR_SERVER_IP`、`DEPLOY_USER`、`YOUR_DEPLOY_KEY`、容器名与目录均需按自己的服务器替换。

```bash
cd liqiming-blog

# 1) 安装依赖
pnpm install --frozen-lockfile

# 2) 完整构建（已包含资源裁剪、字体子集化、脚本压缩和搜索索引）
pnpm build

# 3) 自查：这三项必须成立
ls -d dist/pagefind            # 必须有（搜索索引）
ls dist/pio/models/spine 2>/dev/null && echo "spine 没裁掉，检查配置" || echo "spine 已裁 ✓"
ls dist/pio/static/pio.js      # 必须还在！看板娘运行时，裁掉就没了

# 4) 上传（暂存目录 → 交换，交换后立刻删旧，服务器上不留构建产物副本）
ssh -i ~/.ssh/YOUR_DEPLOY_KEY DEPLOY_USER@YOUR_SERVER_IP \
  'rm -rf /opt/1panel/www/sites/liqiming-blog/index.new && mkdir -p /opt/1panel/www/sites/liqiming-blog/index.new'
tar czf - -C dist . | ssh -i ~/.ssh/YOUR_DEPLOY_KEY DEPLOY_USER@YOUR_SERVER_IP \
  'tar xzf - -C /opt/1panel/www/sites/liqiming-blog/index.new'
ssh -i ~/.ssh/YOUR_DEPLOY_KEY DEPLOY_USER@YOUR_SERVER_IP '
  cd /opt/1panel/www/sites/liqiming-blog
  sudo rm -rf index.old
  sudo mv index index.old && sudo mv index.new index
  sudo chown -R ubuntu:ubuntu index
  sudo rm -rf index.old'     # ← 不保留构建产物副本，需要回滚就重新构建（几秒钟）
```

## 评论系统：服务器端配置（Artalk）

服务器的 `/opt/artalk/artalk.yml`（权限 600），几个容易踩的点：

### ⚠️ 必须显式设置 `login_timeout`，否则登录永远失败

**这是排查了很久的一个坑。** 配置里不写 `login_timeout` 时 Artalk 取默认值 **0**，
导致签发的 JWT **有效期为零**（`exp` 和 `iat` 完全相同），签发瞬间即过期。

服务端每次验签都因 `exp` 失败 → 判定「未登录」→ 前端 `user/status` 永远返回
`is_login: false` → 评论区表现为：

> **输入正确的管理员密码后，仍然反复弹出「键入密码来验证管理员身份」**

排查时容易误判成密码错误或权限问题，实际是 token 根本没生效。

```yaml
login_timeout: 259200   # 秒，3 天
```

**自查方法**——解出 token 的两个时间戳对比：

```bash
TOKEN=$(curl -s -X POST https://liqiming.top/artalk/api/v2/auth/email/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<邮箱>","password":"<密码>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
python3 -c "
import base64,json,sys
p='$TOKEN'.split('.')[1]
j=json.loads(base64.urlsafe_b64decode(p+'='*(-len(p)%4)))
print('有效期(小时):', (j['exp']-j['iat'])/3600)"   # 必须是正数，0 就是没配 login_timeout
```

另一个容易误判的点：**用命令行 `artalk admin --password` 改密码会把 `token_valid_from`
设成当前时间**，从而作废此前签发的所有 token。这是设计如此，重新登录即可。

### 邮箱发送必须配 SMTP，否则登录流程会卡住

Artalk 的**邮箱登录是「发验证码到你邮箱」的流程**。如果没配 SMTP，验证码发不出去，
前端登录框会**卡在中间关不掉**，表现为「登录了但弹窗不消失」。

配置里必须有 `email:` 段（`send_type: smtp` + `smtp.host/port/username/password`）。
`password` 填**QQ 邮箱的授权码**（QQ 邮箱 → 设置 → 账户 → 开启 SMTP 服务 处获取），
**不是 QQ 登录密码**。授权码随时可在 QQ 邮箱重置，重置后同步改这里。

没配 SMTP 时日志会一直刷：

```
[Email] Email Sender initialize failed: unknown email sender type
```

配好后这行消失即代表发送器初始化成功。验证方式是**实际收一封**（发评论触发回复通知，
或从服务器直接发一封测试邮件）——Artalk 只记错误，发信成功时日志里没有痕迹。

### 登录与管理

- 管理员账号存在 SQLite 里，**第一个注册的用户成为管理员**，也可用命令行创建：

  ```bash
  sudo -u artalk env HOME=/opt/artalk /opt/artalk/artalk admin \
    -c /opt/artalk/artalk.yml -w /opt/artalk \
    --name <用户名> --email <邮箱> --password <密码>
  ```
  加 `--password` 会直接覆盖旧密码。

- 评论区那个「**键入密码来验证管理员身份**」是 Artalk 的二次确认（`adminCheck`），
  执行管理操作前要求重输密码——**输的就是管理员密码**，不是另一个密码。
  它的请求是拿「当前登录用户的 name/email」+ 你输入的密码去调登录接口，
  所以**登录的账号必须是管理员那个邮箱**，否则永远验不过。

- `site_default` 必须和前端传的 `site` 完全一致（主题传的是 `siteConfig.title`），
  否则发评论会报 `未找到站点：xxx`。

## ⚠️ OpenResty 容器的「文件级挂载」不会热更新

1Panel 的 OpenResty 容器有两类挂载，行为**不一样**：

| 挂载 | 类型 | 改了宿主机文件后 |
|---|---|---|
| `/opt/1panel/www/conf.d` → `conf.d` | **目录**挂载 | ✅ 容器立刻可见，`openresty -s reload` 即生效 |
| `/opt/1panel/apps/openresty/openresty/conf/nginx.conf` | **文件**挂载 | ❌ 容器仍读旧内容，**必须重启容器** |

**改站点配置走 `conf.d/`，热重载即可；改全局 `nginx.conf`（gzip、连接数等）要重启容器才生效。**

排查时容易误判成"改了没生效/语法错"，实际是挂载层的问题。验证方法——直接对比两边：

```bash
# 宿主机
sudo grep 关键配置 /opt/1panel/apps/openresty/openresty/conf/nginx.conf
# 容器内（不一致就说明还没生效）
sudo docker exec YOUR_OPENRESTY_CONTAINER grep 关键配置 /usr/local/openresty/nginx/conf/nginx.conf
```

重启容器（**会有几秒中断，两个站点都受影响**）：

```bash
sudo docker restart YOUR_OPENRESTY_CONTAINER
```

## 静态资源缓存头

带内容哈希的构建产物（`/_astro/*`、`/assets/*`）文件名变了内容才变，应配
`Cache-Control: public, max-age=31536000, immutable`，否则浏览器每次访问都要发条件请求
回源校验（`If-None-Match`），白白多一个来回。已在两个站点的 conf 里配好。

## favicon

站点图标是看板娘头像（`public/favicon/mascot-*.png`），源图是 `src/assets/images/avatar.avif`。

favicon 在浏览器标签上实际只有 16–32px，**必须裁到头部让脸占满**，全身图会糊成一团。
重新生成（缺少的依赖是 sharp，Astro 自带）：

```bash
node -e '
const sharp=require("sharp");
const SRC="src/assets/images/avatar.avif";
const BOX={ left:146, top:49, width:731, height:731 };  // 头部区域，原图 1024x1024 坐标
(async()=>{ for(const s of [32,128,180,192]){
  let i=sharp(SRC).extract(BOX).resize(s,s,{kernel:"lanczos3"});
  if(s<=64) i=i.sharpen({sigma:0.8});          // 小尺寸轻微锐化，否则发糊
  await i.png({compressionLevel:9}).toFile(`public/favicon/mascot-${s}.png`);
}})();'
```

换别的图时，改 `SRC` 并按新图的构图调 `BOX`（用 `sharp(src).metadata()` 看尺寸，
再把 `BOX` 调成以头部为中心的方框）。

**顺序有讲究**：`Layout.astro` 取 `siteConfig.favicon` 里**第一个 png** 作为 `apple-touch-icon`，
所以 `siteConfig.ts` 的数组要把 180×180 排在开头，否则 iOS 添加到桌面的图标会拿 32px 去放大。

## 构建目标限制：不能用顶层 await

`scripts/minify-inline-scripts.ts` 的目标是 **es2018**，顶层 await 不在其中。
在 `.astro` 的 `is:inline` 模块脚本里写 `const x = (await import(...))` 会让这一步报错：

```
ERROR: Top-level await is not available in the configured target environment ("es2018")
```

改用 `import(...).then(...)`。（`src/components/comment/Artalk.astro` 就踩过这个坑。）

## 服务器上的目录结构

| 路径 | 说明 |
|---|---|
| `/opt/1panel/www/sites/liqiming-blog/index/` | 博客静态文件（由上面的流程上传） |
| `/opt/1panel/www/sites/yu-ai-code-mother/` | AI 平台 |
| `/opt/1panel/www/conf.d/` | nginx 站点配置（1Panel 管理，可直接改） |
| `/opt/artalk/` | 评论后端，见 `docs/artalk-frontend.md` |
| `/opt/mascot-chat/` | 看板娘 AI 代理，见 `docs/mascot-chat-proxy.md` |

修改服务器配置前保留可回滚的备份，并按自己的保留策略清理。

改 nginx 配置后务必先测再重载：

```bash
sudo docker exec YOUR_OPENRESTY_CONTAINER openresty -t && \
sudo docker exec YOUR_OPENRESTY_CONTAINER openresty -s reload
```
