import test from "node:test";
import assert from "node:assert/strict";

import { __test } from "../src/index.mjs";

const env = {
  POST_DIR: "source/_posts",
  DRAFT_DIR: "source/_drafts",
  ASSET_DIR: "source/images/posts",
  SITE_URL: "http://tomfng.space",
  TIME_ZONE: "Asia/Shanghai"
};

test("image data URLs are validated without rewriting their base64 payload", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const parsed = __test.parseImageDataUrl(dataUrl);

  assert.equal(parsed.mime, "image/png");
  assert.equal(parsed.extension, "png");
  assert.equal(parsed.size, png.length);
  assert.equal(parsed.base64, png.toString("base64"));
});

test("image uploads reject unsupported, oversized, and mismatched data", () => {
  assert.throws(
    () => __test.parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="),
    /只支持 PNG/
  );
  assert.throws(
    () => __test.parseImageDataUrl(`data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64")}`),
    /不能超过 10 MB/
  );
  assert.throws(
    () => __test.parseImageDataUrl(`data:image/png;base64,${Buffer.from("not a png").toString("base64")}`),
    /文件类型不匹配/
  );
});

test("image paths stay under the dated public asset directory", () => {
  const path = __test.assetFilePath("截图 01.PNG", "image/png", env, {
    date: new Date("2026-07-13T02:00:00.000Z"),
    unique: "fixed-id"
  });

  assert.equal(path, "source/images/posts/2026/07/01-fixed-id.png");
  assert.equal(__test.publicAssetUrl(path), "/images/posts/2026/07/01-fixed-id.png");
  assert.throws(
    () => __test.assetFilePath("image.png", "image/png", { ...env, ASSET_DIR: "source/../private" }),
    /ASSET_DIR 配置无效/
  );
});

test("published Markdown round-trips through the Hexo parser", () => {
  const note = {
    id: "note-123",
    title: "同名文章",
    slug: "same-title",
    category: "工程",
    tags: ["Hexo", "Admin"],
    summary: "发布测试",
    frontMatter: { comments: false, custom_field: "kept" },
    content: "正文第一段\n\n- 条目",
    createdAt: "2026-07-13T02:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z"
  };

  const markdown = __test.buildHexoPost(note, env, "revision-123");
  const parsed = __test.parseHexoPost(markdown, "source/_posts/same-title.md", "sha-123", env);

  assert.match(markdown, /admin_id: note-123/);
  assert.match(markdown, /custom_field: kept/);
  assert.match(markdown, /<!-- tomfng-admin-revision:revision-123 -->/);
  assert.equal(parsed.id, note.id);
  assert.equal(parsed.title, note.title);
  assert.equal(parsed.slug, note.slug);
  assert.equal(parsed.category, note.category);
  assert.deepEqual(parsed.tags, note.tags);
  assert.equal(parsed.summary, note.summary);
  assert.equal(parsed.content, note.content);
  assert.equal(parsed.remotePath, "source/_posts/same-title.md");
  assert.equal(parsed.remoteSha, "sha-123");
  assert.equal(parsed.frontMatter.comments, false);
  assert.equal(parsed.frontMatter.custom_field, "kept");
});

test("publication checks use the resolved slug", () => {
  const url = __test.publicPostUrl({
    title: "同名文章",
    slug: "same-title",
    createdAt: "2026-07-13T02:00:00.000Z"
  }, env, "same-title-2");

  assert.equal(url, "http://tomfng.space/2026/07/13/same-title-2/");
});

test("post paths cannot escape the configured article directory", () => {
  assert.equal(__test.safePostPath("source/_posts/hello.md", env), "source/_posts/hello.md");
  assert.throws(() => __test.safePostPath("source/pages/hello.md", env), /无效的文章路径/);
  assert.throws(() => __test.safePostPath("source/_posts/../secret.md", env), /无效的文章路径/);
});

test("a new same-title article gets a unique path instead of overwriting", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const existing = __test.buildHexoPost({
    id: "another-note",
    title: "同名文章",
    slug: "same-title",
    content: "旧正文",
    createdAt: "2026-07-13T02:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z"
  }, env, "old-revision");
  globalThis.fetch = async (url) => {
    if (String(url).includes("same-title-2.md")) {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ sha: "existing-sha", content: Buffer.from(existing).toString("base64") }), { status: 200 });
  };

  const target = await __test.resolvePostTarget({
    id: "new-note",
    title: "同名文章",
    slug: "same-title"
  }, { ...env, GITHUB_OWNER: "Nike232", GITHUB_REPO: "Nike232.github.io", GITHUB_BRANCH: "source" });

  assert.deepEqual(target, {
    path: "source/_posts/same-title-2.md",
    slug: "same-title-2",
    sha: null
  });
});

test("publishing rejects a stale remote revision", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ sha: "new-sha", content: "" }), { status: 200 });

  await assert.rejects(
    __test.resolvePostTarget({
      id: "note-123",
      title: "文章",
      remotePath: "source/_posts/post.md",
      remoteSha: "old-sha"
    }, { ...env, GITHUB_OWNER: "Nike232", GITHUB_REPO: "Nike232.github.io", GITHUB_BRANCH: "source" }),
    /远程文章已被修改/
  );
});

test("the deployment revision marker is not exposed in the editor", () => {
  assert.equal(
    __test.stripRevisionMarker("正文\n\n<!-- tomfng-admin-revision:abc -->\n").trim(),
    "正文"
  );
});

test("draft paths are recognized and content paths accept posts or drafts", () => {
  assert.equal(__test.isDraftPath("source/_drafts/hello.md"), true);
  assert.equal(__test.isDraftPath("source/_posts/hello.md"), false);
  assert.equal(__test.safeContentPath("source/_drafts/a.md", env), "source/_drafts/a.md");
  assert.equal(__test.safeContentPath("source/_posts/a.md", env), "source/_posts/a.md");
  assert.throws(() => __test.safeContentPath("source/secret/a.md", env), /无效的文章路径/);
  assert.equal(__test.draftFilePath({ title: "草稿", slug: "draft-1" }, env), "source/_drafts/draft-1.md");
});

test("draft Markdown round-trips with parent id and draft status", () => {
  const note = {
    id: "draft-1",
    title: "远端草稿",
    slug: "remote-draft",
    category: "写作",
    tags: ["idea"],
    parentId: "parent-9",
    summary: "草稿摘要",
    content: "草稿正文",
    createdAt: "2026-07-13T02:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z"
  };
  const markdown = __test.buildHexoPost(note, env, "rev-draft");
  const parsed = __test.parseHexoPost(markdown, "source/_drafts/remote-draft.md", "sha-d", env);
  assert.match(markdown, /admin_parent: parent-9/);
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.parentId, "parent-9");
  assert.equal(parsed.remotePath, "source/_drafts/remote-draft.md");
});

test("resolveDraftTarget rejects already-published remote paths", async () => {
  await assert.rejects(
    __test.resolveDraftTarget({
      id: "note-1",
      title: "已发",
      slug: "published",
      remotePath: "source/_posts/published.md",
      remoteSha: "sha"
    }, env),
    /不能另存为远端草稿/
  );
});

test("publicPostUrl uses Shanghai calendar dates", () => {
  const url = __test.publicPostUrl({
    title: "时区",
    slug: "tz",
    createdAt: "2026-07-12T16:30:00.000Z"
  }, env);
  assert.equal(url, "http://tomfng.space/2026/07/13/tz/");
});
