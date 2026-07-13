# Blog Admin Worker

这个 Worker 是博客后台的真正鉴权层：前端只负责编辑，登录和发布都交给 Worker。

## GitHub 侧准备

1. 新建一个 GitHub OAuth App。
2. Authorization callback URL 填：`https://你的-worker域名/api/owner/callback`。
3. 给 Worker 配置 OAuth 的 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`。
4. 再创建一个只给博客源码仓库使用的 fine-grained token，权限只需要 `Contents: Read and write`，配置为 `GITHUB_TOKEN`。

## Cloudflare 侧配置

```bash
cd admin-worker
npm install
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SESSION_SECRET
npm run deploy
```

`wrangler.jsonc` 里的 `GITHUB_REPO` / `GITHUB_BRANCH` 要指向 Hexo 源码仓库和分支，不是纯静态输出分支。当前主域名是 `tomfng.space`。如果域名还不在 Cloudflare DNS 下，先用 `workers.dev` 域名即可，把这个地址填到管理页的“发布服务地址”。以后如果把域名接入 Cloudflare，也可以把 Worker 路由到同一个域名的 `/api/*`，那一栏就能留空。

## 数据与接口

- `GET /api/posts` 从 `source/_posts` 读取文章，Admin 会和本机草稿安全合并。
- `POST /api/publish` 新建或更新文章；同名文章会自动生成唯一路径。
- `DELETE /api/posts` 删除已发布文章。
- `GET /api/publish-status` 使用每次发布的唯一 revision 判断新内容是否真正上线。

本机草稿仍保存在浏览器中；已发布文章以 GitHub 上的 Markdown 文件为准。同步不会覆盖本机未发布修改，远程发生并发修改时发布会返回冲突错误。
