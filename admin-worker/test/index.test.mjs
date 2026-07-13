import test from "node:test";
import assert from "node:assert/strict";

import { __test } from "../src/index.mjs";

const env = {
  POST_DIR: "source/_posts",
  SITE_URL: "http://tomfng.space",
  TIME_ZONE: "Asia/Shanghai"
};

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
