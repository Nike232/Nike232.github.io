const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../source/note-utils.js");

const { markdownToHtml, mergeRemotePosts, normalizeNote } = window.TomfngNoteTools;

function post(overrides = {}) {
  return normalizeNote({
    id: "post-1",
    title: "文章",
    slug: "post",
    category: "工程",
    tags: [],
    status: "published",
    content: "远程正文",
    createdAt: "2026-07-13T02:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z",
    remotePath: "source/_posts/post.md",
    remoteSha: "sha-1",
    ...overrides
  });
}

test("remote synchronization keeps local drafts", () => {
  const draft = post({
    id: "draft-1",
    status: "draft",
    remotePath: "",
    remoteSha: "",
    localDirty: true
  });
  const result = mergeRemotePosts({ notes: [draft] }, { notes: [] });

  assert.equal(result.data.notes.length, 1);
  assert.equal(result.data.notes[0].id, draft.id);
  assert.equal(result.data.notes[0].status, "draft");
});

test("remote synchronization preserves unpublished local edits", () => {
  const local = post({ content: "本地新正文", localDirty: true, remoteSha: "old-sha" });
  const remote = post({ content: "远程新正文", localDirty: false, remoteSha: "new-sha" });
  const result = mergeRemotePosts({ notes: [local] }, { notes: [remote] });

  assert.equal(result.preserved, 1);
  assert.equal(result.data.notes[0].content, "本地新正文");
  assert.equal(result.data.notes[0].remoteSha, "old-sha");
  assert.equal(result.data.notes[0].localDirty, true);
});

test("remote synchronization imports posts on a clean browser", () => {
  const remote = post();
  const result = mergeRemotePosts({ notes: [] }, { notes: [remote] });

  assert.equal(result.data.notes.length, 1);
  assert.equal(result.data.notes[0].remotePath, remote.remotePath);
  assert.equal(result.data.notes[0].localDirty, false);
});

test("a remotely deleted clean post is removed locally", () => {
  const result = mergeRemotePosts({ notes: [post()] }, { notes: [] });
  assert.equal(result.data.notes.length, 0);
});

test("Markdown preview renders safe local and remote images", () => {
  const html = markdownToHtml([
    "![本地截图](/images/posts/2026/07/demo.png)",
    "",
    "![远程图片](https://images.example.com/demo.webp)"
  ].join("\n"));

  assert.match(html, /<img src="\/images\/posts\/2026\/07\/demo\.png" alt="本地截图"/);
  assert.match(html, /<img src="https:\/\/images\.example\.com\/demo\.webp" alt="远程图片"/);
});

test("Markdown preview does not turn unsafe image URLs into elements", () => {
  const html = markdownToHtml([
    "![脚本](javascript:alert(1))",
    "![跨站](//evil.example/image.png)",
    "<!--tomfng-image-upload:pending-id-->"
  ].join("\n"));

  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /tomfng-image-upload/);
});
