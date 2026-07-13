const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../source/note-utils.js");

const TurndownService = require("turndown");
const turndownPluginGfm = require("turndown-plugin-gfm");

const {
  createHtmlToMarkdown,
  extractMarkdownHeadings,
  markdownBlockTemplate,
  markdownToHtml,
  mergeRemotePosts,
  normalizeEditorViewState,
  normalizeNote,
  transformMarkdownBlockLines
} = window.TomfngNoteTools;

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

test("rich clipboard HTML becomes clean GFM Markdown", () => {
  const convert = createHtmlToMarkdown(TurndownService, turndownPluginGfm);
  const markdown = convert(`
    <h2>实验记录</h2>
    <p><strong>结论</strong>和<del>旧结论</del>，参考<a href="https://example.com/a b">文档</a>。</p>
    <ul><li><input type="checkbox" checked>完成实验</li></ul>
    <table><tbody><tr><td>指标</td><td>值</td></tr><tr><td>准确率</td><td>98%</td></tr></tbody></table>
  `);

  assert.match(markdown, /^## 实验记录/m);
  assert.match(markdown, /\*\*结论\*\*/);
  assert.match(markdown, /~~旧结论~~/);
  assert.match(markdown, /\[文档\]\(https:\/\/example\.com\/a%20b\)/);
  assert.match(markdown, /\[x\] 完成实验/);
  assert.match(markdown, /\| 指标 \| 值 \|/);
  assert.match(markdown, /\| 准确率 \| 98% \|/);
});

test("rich clipboard conversion drops unsafe links and images", () => {
  const convert = createHtmlToMarkdown(TurndownService, turndownPluginGfm);
  const markdown = convert(`
    <p><a href="javascript:alert(1)">危险链接</a></p>
    <img src="data:image/png;base64,AAAA" alt="内联图片">
    <img src="/images/safe.png" alt="安全图片">
  `);

  assert.match(markdown, /危险链接/);
  assert.doesNotMatch(markdown, /javascript:|data:image/);
  assert.match(markdown, /!\[安全图片\]\(\/images\/safe\.png\)/);
});

test("document outline extracts rendered headings and ignores code fences", () => {
  const headings = extractMarkdownHeadings([
    "# **开始**",
    "",
    "章节二",
    "-----",
    "",
    "```md",
    "# 代码里的标题",
    "```",
    "",
    "### [结论](https://example.com) #"
  ].join("\n"));

  assert.deepEqual(headings, [
    { line: 0, level: 1, text: "开始" },
    { line: 2, level: 2, text: "章节二" },
    { line: 9, level: 3, text: "结论" }
  ]);
});

test("block commands transform and toggle Markdown lines", () => {
  assert.deepEqual(
    transformMarkdownBlockLines(["第一项", "", "第二项"], "ordered-list"),
    ["1. 第一项", "", "2. 第二项"]
  );
  assert.deepEqual(
    transformMarkdownBlockLines(["- 第一项", "- 第二项"], "bullet-list"),
    ["第一项", "第二项"]
  );
  assert.deepEqual(
    transformMarkdownBlockLines(["> - 保留内部列表"], "quote"),
    ["- 保留内部列表"]
  );
  assert.deepEqual(
    transformMarkdownBlockLines(["  普通内容"], "task-list"),
    ["  - [ ] 普通内容"]
  );
});

test("block insertion templates preserve the intended cursor selection", () => {
  const table = markdownBlockTemplate("table");
  assert.equal(table.body.slice(table.selectionStart, table.selectionEnd), "列 1");
  assert.match(table.body, /\| --- \| --- \| --- \|/);

  const code = markdownBlockTemplate("code-block", "const value = 1;");
  assert.equal(code.body.slice(code.selectionStart, code.selectionEnd), "const value = 1;");
  assert.match(code.body, /^```\n/);
  assert.match(code.body, /\n```$/);
});

test("editor view state keeps safe bounded document positions", () => {
  const view = normalizeEditorViewState({
    selectedId: "note-b",
    category: "写作",
    sidebarMode: "outline",
    notes: {
      "note-a": { cursor: { line: 8.9, ch: -4 }, scrollTop: 280.5, scrollLeft: "12", pageScrollY: "640" },
      "note-b": { cursor: { line: "3", ch: "17" }, scrollTop: -1, scrollLeft: null, pageScrollY: -2 },
      "": { cursor: { line: 1, ch: 1 } },
      "__proto__": { cursor: { line: 99, ch: 99 } }
    }
  });

  assert.equal(view.selectedId, "note-b");
  assert.equal(view.category, "写作");
  assert.equal(view.sidebarMode, "outline");
  assert.deepEqual(view.notes["note-a"], {
    cursor: { line: 8, ch: 0 },
    scrollTop: 280.5,
    scrollLeft: 12,
    pageScrollY: 640
  });
  assert.deepEqual(view.notes["note-b"], {
    cursor: { line: 3, ch: 17 },
    scrollTop: 0,
    scrollLeft: 0,
    pageScrollY: 0
  });
  assert.equal(Object.hasOwn(view.notes, ""), false);
  assert.equal(Object.hasOwn(view.notes, "__proto__"), false);

  const crowded = normalizeEditorViewState({
    notes: Object.fromEntries(Array.from({ length: 55 }, (_, index) => [
      `note-${index}`,
      { cursor: { line: index, ch: 0 } }
    ]))
  });
  assert.equal(Object.keys(crowded.notes).length, 50);
  assert.equal(Object.hasOwn(crowded.notes, "note-0"), false);
  assert.equal(Object.hasOwn(crowded.notes, "note-54"), true);
});
