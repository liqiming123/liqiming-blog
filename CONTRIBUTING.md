# 参与贡献 / Contributing

感谢你帮助改进启明的博客。本项目基于 Firefly 定制，请在复用和修改时保留上游版权与来源。

## 反馈问题

在 [Issues](https://github.com/liqiming123/liqiming-blog/issues) 中提供复现步骤、预期与实际表现、Node.js / pnpm 版本和浏览器信息。界面问题请附截图，并移除日志中的密钥或个人数据。

## 提交改进

1. Fork 仓库，基于 `main` 创建自己的分支。
2. 用 `pnpm install --frozen-lockfile` 安装依赖。
3. 保持 Pull Request 专注于一个问题。较大的功能或设计改动请先开 Issue 讨论。
4. 使用 Conventional Commits，例如 `fix: correct feed links` 或 `docs: clarify local setup`。
5. 运行下面的检查，并在 Pull Request 中说明结果。界面改动附实际页面截图。

```bash
pnpm check
pnpm type-check
pnpm build
```

格式化工具是 Biome，项目使用 Tab 缩进和双引号。`pnpm format` / `pnpm lint` 会修改文件，提交前请检查 diff，避免无关格式化改动。

不要提交 `node_modules/`、`dist/`、`.env`、私钥、服务端密钥或生产数据库。文章和素材请注明来源。
