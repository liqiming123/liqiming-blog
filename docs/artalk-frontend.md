# Artalk 前端（自托管）

主题默认从 `https://unpkg.com/artalk/` 加载评论前端。unpkg 在国内经常不稳，
这里改为自托管，同源加载，不受第三方 CDN 影响。

- 包：npm `artalk`
- 版本：**2.10.0**（须与服务端 `/opt/artalk/artalk` 的版本一致）
- 来源：`https://registry.npmmirror.com/artalk/2.10.0/files/dist/`
- 已与 unpkg 同版本文件比对，sha256 一致：
  - `Artalk.js` — `bf75c86cecf0cc66...`（198767 字节）
  - `Artalk.css` — `6838d478de7fdc09...`（37735 字节）

## ⚠️ 不要把文件改回 `.mjs`

npm 包里原文件名是 `Artalk.mjs`，这里**必须存成 `.js`**：

容器内 OpenResty 的 `mime.types` 不认 `.mjs`，会回落成 `content-type: application/octet-stream`，
而浏览器对 ES 模块做严格 MIME 校验，类型不对就**静默拒绝执行**——表现是评论区整个不渲染
（`#artalk` 挂载点一直是空的），且控制台之外很难看出原因。

`.js` 会被正确映射成 `application/javascript`。用 `import()` 加载时，模块类型由导入方式决定，
与扩展名无关，所以改成 `.js` 功能完全一致。

## 升级步骤

1. 在服务器上升级 artalk 二进制并重启服务
2. 从 `https://registry.npmmirror.com/artalk/<新版本>/files/dist/` 下载两个文件覆盖这里
   （注意 `Artalk.mjs` 要另存为 `Artalk.js`）
3. 重新构建部署博客
