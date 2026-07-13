const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { marked } = require("marked");

global.window = new JSDOM("<!doctype html><html><body></body></html>").window;
window.marked = marked;
window.markedKatex = require("marked-katex-extension");
window.markedFootnote = require("marked-footnote");
window.DOMPurify = require("dompurify")(window);
require("../source/note-utils.js");

const TurndownService = require("turndown");
const turndownPluginGfm = require("turndown-plugin-gfm");

const {
  createHtmlToMarkdown,
  editMarkdownTable,
  extractMarkdownHeadings,
  filterNotesByQuery,
  findMarkdownImageAt,
  findMarkdownLinkAt,
  formatMarkdownImage,
  formatMarkdownLink,
  getMarkdownTableContext,
  markdownBlockTemplate,
  markdownFootnoteTemplate,
  markdownToHtml,
  mergeRemotePosts,
  normalizeEditorViewState,
  normalizeMarkdownImageUrl,
  normalizeMarkdownLinkUrl,
  normalizeNote,
  parseMarkdownSlashContext,
  toggleMarkdownTask,
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

test("Markdown preview renders complete GFM document structures", () => {
  const html = markdownToHtml([
    "# 一级标题",
    "",
    "###### 六级标题",
    "",
    "1. 第一项",
    "2. 第二项",
    "",
    "- [x] 已完成",
    "- [ ] 待处理",
    "",
    "~~旧结论~~",
    "",
    "质能关系为 $E = mc^2$。",
    "",
    "$$",
    "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
    "$$",
    "",
    "| 指标 | 值 |",
    "| --- | ---: |",
    "| 准确率 | 98% |",
    "",
    "```js",
    "const answer = 42;",
    "```",
    "",
    "[相对链接](./guide.md)"
  ].join("\n"));

  assert.match(html, /<h1>一级标题<\/h1>/);
  assert.match(html, /<h6>六级标题<\/h6>/);
  assert.match(html, /<ol>[\s\S]*<li>第一项<\/li>/);
  assert.match(html, /class="task-checkbox is-checked"[^>]+aria-checked="true"/);
  assert.match(html, /class="task-checkbox"[^>]+aria-checked="false"/);
  assert.match(html, /<del>旧结论<\/del>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<annotation encoding="application\/x-tex">E = mc\^2<\/annotation>/);
  assert.match(html, /<table>[\s\S]*<th>指标<\/th>[\s\S]*<td[^>]*>98%<\/td>/);
  assert.match(html, /<code class="language-js">const answer = 42;/);
  assert.match(html, /<a href="\.\/guide\.md">相对链接<\/a>/);
});

test("Markdown preview renders safe linked footnotes", () => {
  const html = markdownToHtml([
    "正文引用[^1]。",
    "",
    "[^1]: 脚注内容与[危险链接](javascript:alert(1))。"
  ].join("\n"));

  assert.match(html, /<sup><a id="footnote-ref-1" href="#footnote-1" data-footnote-ref/);
  assert.match(html, /<section class="footnotes" data-footnotes(?:="")?>/);
  assert.match(html, /<li id="footnote-1">[\s\S]*脚注内容/);
  assert.match(html, /data-footnote-backref[^>]+aria-label="返回引用 1"/);
  assert.doesNotMatch(html, /javascript:/i);
});

test("Markdown preview preserves Mermaid diagrams for local rendering", () => {
  const html = markdownToHtml([
    "```mermaid",
    "graph TD",
    "  A[开始] --> B[完成]",
    "```"
  ].join("\n"));

  assert.match(html, /^<pre class="tomfng-mermaid">graph TD/);
  assert.match(html, /A\[开始\] --&gt; B\[完成\]/);
  assert.doesNotMatch(html, /<code class="language-mermaid">/);
});

test("full Markdown rendering removes executable and unsafe HTML", () => {
  const html = markdownToHtml([
    '<script>alert("x")</script>',
    '<form><input value="secret"><button>提交</button></form>',
    '<img src="data:image/png;base64,AAAA" alt="内联">',
    '<img src="//evil.example/image.png" alt="跨站">',
    '<a href="javascript:alert(1)" style="color:red">危险</a>',
    '[危险链接](javascript:alert(1))',
    '$\\href{javascript:alert(1)}{危险公式链接}$'
  ].join("\n"));
  const document = new JSDOM(html).window.document;
  const unsafeUrl = [...document.querySelectorAll("[href], [src]")].some((element) => {
    const value = element.getAttribute("href") || element.getAttribute("src") || "";
    return /^(?:javascript:|data:|\/\/)/i.test(value);
  });

  assert.doesNotMatch(html, /<(?:script|form|input|button)\b/i);
  assert.equal(unsafeUrl, false);
  assert.equal(document.querySelector("a[style]"), null);
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

test("task toggles preserve nested Markdown list prefixes", () => {
  assert.deepEqual(toggleMarkdownTask("- [ ] 写作"), {
    line: "- [x] 写作",
    checked: true,
    stateCh: 3
  });
  assert.deepEqual(toggleMarkdownTask("  > 3. [X] 发布"), {
    line: "  > 3. [ ] 发布",
    checked: false,
    stateCh: 8
  });
  assert.equal(toggleMarkdownTask("正文中的 - [ ] 不是待办项"), null);
});

test("slash commands only open at a Markdown block boundary", () => {
  assert.deepEqual(parseMarkdownSlashContext("/", 1), { fromCh: 0, toCh: 1, query: "" });
  assert.deepEqual(parseMarkdownSlashContext("  /标题", 5), { fromCh: 2, toCh: 5, query: "标题" });
  assert.equal(parseMarkdownSlashContext("正文 /标题", 6), null);
  assert.equal(parseMarkdownSlashContext("    /代码", 7), null);
  assert.equal(parseMarkdownSlashContext("/标题 后文", 3), null);
  assert.equal(parseMarkdownSlashContext("https://example.com", 8), null);
});

test("page search matches every term across note metadata and content", () => {
  const notes = [
    { id: "a", title: "无线网络", category: "研究", tags: ["WiFi"], summary: "速率控制", content: "实验结果" },
    { id: "b", title: "读书笔记", category: "阅读", tags: ["经济学"], summary: "", content: "市场价格" },
    { id: "c", title: "写作草稿", category: "研究", tags: ["想法"], summary: "网络协议", content: "待验证" }
  ];

  assert.deepEqual(filterNotesByQuery(notes, "研究 网络").map((note) => note.id), ["a", "c"]);
  assert.deepEqual(filterNotesByQuery(notes, "wifi 结果").map((note) => note.id), ["a"]);
  assert.deepEqual(filterNotesByQuery(notes, "经济学").map((note) => note.id), ["b"]);
  assert.deepEqual(filterNotesByQuery(notes, ""), notes);
});

test("block insertion templates preserve the intended cursor selection", () => {
  const table = markdownBlockTemplate("table");
  assert.equal(table.body.slice(table.selectionStart, table.selectionEnd), "列 1");
  assert.match(table.body, /\| --- \| --- \| --- \|/);

  const code = markdownBlockTemplate("code-block", "const value = 1;");
  assert.equal(code.body.slice(code.selectionStart, code.selectionEnd), "const value = 1;");
  assert.match(code.body, /^```\n/);
  assert.match(code.body, /\n```$/);

  const math = markdownBlockTemplate("math-block", "E = mc^2");
  assert.equal(math.body, "$$\nE = mc^2\n$$");
  assert.equal(math.body.slice(math.selectionStart, math.selectionEnd), "E = mc^2");

  const mermaid = markdownBlockTemplate("mermaid");
  assert.match(mermaid.body, /^```mermaid\n/);
  assert.equal(
    mermaid.body.slice(mermaid.selectionStart, mermaid.selectionEnd),
    "graph TD\n  A[开始] --> B[完成]"
  );

  assert.deepEqual(markdownFootnoteTemplate("已有引用[^2]。", "补充说明"), {
    reference: "[^3]",
    definition: "[^3]: 补充说明",
    selectionStart: 6,
    selectionEnd: 10
  });
});

test("inline links can be found, normalized, and rewritten in place", () => {
  const line = '访问 [OpenAI](https://openai.com/docs_(v2) "官方") 与 ![图片](/image.png)';
  const link = findMarkdownLinkAt(line, line.indexOf("OpenAI") + 2);

  assert.deepEqual(link, {
    from: line.indexOf("[OpenAI]"),
    to: line.indexOf(" 与"),
    label: "OpenAI",
    url: "https://openai.com/docs_(v2)",
    titleSuffix: ' "官方"'
  });
  assert.equal(findMarkdownLinkAt(line, line.indexOf("图片") + 1), null);
  assert.deepEqual(findMarkdownImageAt(line, line.indexOf("图片") + 1), {
    from: line.indexOf("![图片]"),
    to: line.length,
    alt: "图片",
    url: "/image.png",
    titleSuffix: ""
  });
  assert.equal(findMarkdownLinkAt('[\\[规范\\]](./guide.md)', 4).label, "[规范]");

  assert.equal(normalizeMarkdownLinkUrl("https://example.com/a (b)"), "https://example.com/a%20%28b%29");
  assert.equal(normalizeMarkdownLinkUrl("../guide.md#intro"), "../guide.md#intro");
  assert.equal(normalizeMarkdownLinkUrl("javascript:alert(1)"), "");
  assert.equal(normalizeMarkdownLinkUrl("//evil.example"), "");
  assert.equal(normalizeMarkdownImageUrl("/images/photo (1).webp"), "/images/photo%20%281%29.webp");
  assert.equal(normalizeMarkdownImageUrl("mailto:owner@example.com"), "");
  assert.equal(normalizeMarkdownImageUrl("#preview"), "");
  assert.equal(
    formatMarkdownLink("A [B]", "https://example.com/a_(b)", ' "说明"'),
    '[A \\[B\\]](https://example.com/a_%28b%29 "说明")'
  );
  assert.equal(
    formatMarkdownImage("示例 [图]", "/images/photo (1).webp"),
    '![示例 \\[图\\]](/images/photo%20%281%29.webp)'
  );
});

test("table editing identifies cells and preserves escaped or inline-code pipes", () => {
  const lines = [
    "| 名称 | 值 |",
    "| :--- | ---: |",
    "| `a|b` | x\\|y |"
  ];
  const context = getMarkdownTableContext(lines, { line: 2, ch: 12 });

  assert.deepEqual(context, {
    fromLine: 0,
    toLine: 2,
    separatorLine: 1,
    rowType: "body",
    rowCount: 1,
    columnCount: 2,
    column: 1,
    alignment: "right"
  });

  const added = editMarkdownTable(lines, { line: 2, ch: 12 }, "add-row");
  assert.deepEqual(added.lines, [
    "| 名称 | 值 |",
    "| :--- | ---: |",
    "| `a|b` | x\\|y |",
    "|  |  |"
  ]);
  assert.deepEqual(added.cursor, { line: 3, ch: 5 });
});

test("table editing adds and removes columns, rows, and alignment", () => {
  const lines = [
    "前文",
    "| 名称 | 值 |",
    "| :--- | ---: |",
    "| A | 1 |",
    "后文"
  ];
  const addedColumn = editMarkdownTable(lines, { line: 1, ch: 3 }, "add-column");
  assert.deepEqual(addedColumn.lines, [
    "| 名称 |  | 值 |",
    "| :--- | --- | ---: |",
    "| A |  | 1 |"
  ]);
  assert.deepEqual(addedColumn.cursor, { line: 1, ch: 7 });

  const centered = editMarkdownTable(lines, { line: 3, ch: 8 }, "align", "center");
  assert.equal(centered.lines[1], "| :--- | :---: |");

  const deletedRow = editMarkdownTable(lines, { line: 3, ch: 3 }, "delete-row");
  assert.deepEqual(deletedRow.lines, ["| 名称 | 值 |", "| :--- | ---: |"]);
  assert.deepEqual(deletedRow.cursor, { line: 1, ch: 2 });

  const deletedColumn = editMarkdownTable(lines, { line: 3, ch: 8 }, "delete-column");
  assert.deepEqual(deletedColumn.lines, ["| 名称 |", "| :--- |", "| A |"]);
  assert.equal(editMarkdownTable(deletedColumn.lines, { line: 2, ch: 3 }, "delete-column"), null);
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
