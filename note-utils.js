(function () {
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeNotesData(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const notes = Array.isArray(source.notes) ? source.notes : [];
  return {
    version: Number(source.version || 1),
    updatedAt: source.updatedAt || new Date().toISOString(),
    notes: notes.map(normalizeNote).sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
  };
}

function normalizeNote(note = {}) {
  const now = new Date().toISOString();
  const title = String(note.title || "无标题").trim();
  return {
    id: String(note.id || makeId()),
    title,
    slug: String(note.slug || makeSlug(title)).trim(),
    category: normalizeCategory(note.category),
    summary: String(note.summary || "").trim(),
    tags: normalizeTags(note.tags),
    status: note.status === "published" ? "published" : "draft",
    content: String(note.content || ""),
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now,
    remotePath: String(note.remotePath || ""),
    remoteSha: String(note.remoteSha || ""),
    localDirty: Boolean(note.localDirty),
    parseError: String(note.parseError || ""),
    frontMatter: note.frontMatter && typeof note.frontMatter === "object" ? note.frontMatter : {}
  };
}

function normalizeCategory(category) {
  return String(category || "未分类").trim() || "未分类";
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeSlug(value = "") {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || `note-${Date.now().toString(36)}`;
}

function noteContentFingerprint(note) {
  return JSON.stringify({
    title: String(note?.title || "").trim(),
    slug: String(note?.slug || "").trim(),
    category: normalizeCategory(note?.category),
    tags: normalizeTags(note?.tags),
    summary: String(note?.summary || "").trim(),
    content: String(note?.content || "").replace(/\r\n/g, "\n").trim()
  });
}

function mergeRemotePosts(localData, remoteData) {
  const localNotes = normalizeNotesData(localData || { notes: [] }).notes;
  const remoteNotes = normalizeNotesData(remoteData || { notes: [] }).notes.map((note) => ({
    ...note,
    status: "published",
    localDirty: false
  }));
  const remoteByPath = new Map(remoteNotes.filter((note) => note.remotePath).map((note) => [note.remotePath, note]));
  const remoteBySlug = new Map(remoteNotes.map((note) => [String(note.slug || "").toLowerCase(), note]));
  const consumed = new Set();
  const merged = [];
  let preserved = 0;

  localNotes.forEach((local) => {
    const remote = (local.remotePath && remoteByPath.get(local.remotePath))
      || (local.status === "published" && remoteBySlug.get(String(local.slug || "").toLowerCase()));
    if (remote) {
      consumed.add(remote.remotePath || remote.id);
      const same = noteContentFingerprint(local) === noteContentFingerprint(remote);
      const keepLocal = !same && (local.localDirty || !local.remoteSha);
      if (keepLocal) {
        preserved += 1;
        merged.push(normalizeNote({
          ...local,
          status: "published",
          remotePath: remote.remotePath,
          remoteSha: local.remoteSha || remote.remoteSha,
          localDirty: true
        }));
      } else {
        merged.push(remote);
      }
      return;
    }

    if (local.remotePath) {
      if (local.localDirty) {
        preserved += 1;
        merged.push(normalizeNote({
          ...local,
          status: "draft",
          remotePath: "",
          remoteSha: "",
          localDirty: true
        }));
      }
      return;
    }
    merged.push(local);
  });

  remoteNotes.forEach((remote) => {
    if (!consumed.has(remote.remotePath || remote.id)) merged.push(remote);
  });

  return {
    preserved,
    data: normalizeNotesData({ version: 2, updatedAt: new Date().toISOString(), notes: merged })
  };
}

function markdownToHtml(markdown = "") {
  const cleanMarkdown = String(markdown).replace(/<!--tomfng-image-upload:[^>]+-->/g, "");
  const fullMarkdown = renderFullMarkdown(cleanMarkdown);
  if (fullMarkdown !== null) return fullMarkdown;
  const segments = cleanMarkdown.split(/```/);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        const lines = segment.replace(/^\w+\n/, "").replace(/\n$/, "");
        return `<pre><code>${escapeHtml(lines)}</code></pre>`;
      }
      return renderBlocks(segment);
    })
    .join("");
}

function renderFullMarkdown(markdown) {
  const browser = globalThis.window || globalThis;
  const markedLibrary = browser.marked;
  const mathExtension = browser.markedKatex;
  const footnoteExtension = browser.markedFootnote;
  const sanitizer = browser.DOMPurify;
  if (
    typeof markedLibrary?.parse !== "function"
    || typeof markedLibrary?.Renderer !== "function"
    || typeof sanitizer?.sanitize !== "function"
  ) return null;

  const renderer = new markedLibrary.Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = function renderSafeLink({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens);
    const url = safeRenderedUrl(href, false);
    if (!url) return label;
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    const externalAttributes = /^https?:\/\//i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtml(url)}"${titleAttribute}${externalAttributes}>${label}</a>`;
  };
  renderer.image = ({ href, title, text }) => {
    const url = safeRenderedUrl(href, true);
    if (!url) return escapeHtml(text || "");
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text || "")}" loading="lazy" decoding="async"${titleAttribute}>`;
  };
  const defaultCodeRenderer = renderer.code;
  renderer.code = function renderCode(token) {
    if (/^\s*(?:mermaid|mmd)(?:\s|$)/i.test(String(token?.lang || ""))) {
      return `<pre class="tomfng-mermaid">${escapeHtml(token?.text || "")}</pre>`;
    }
    return defaultCodeRenderer.call(this, token);
  };
  renderer.checkbox = ({ checked }) => (
    `<span class="task-checkbox${checked ? " is-checked" : ""}" role="checkbox" aria-checked="${checked ? "true" : "false"}" aria-disabled="true"></span>`
  );

  try {
    const parser = typeof markedLibrary.Marked === "function" ? new markedLibrary.Marked() : markedLibrary;
    if (typeof mathExtension === "function" && typeof parser.use === "function") {
      parser.use(mathExtension({
        nonStandard: true,
        output: "htmlAndMathml",
        strict: "warn",
        throwOnError: false,
        trust: false
      }));
    }
    if (typeof footnoteExtension === "function" && typeof parser.use === "function") {
      parser.use(footnoteExtension({
        description: "脚注",
        backRefLabel: "返回引用 {0}"
      }));
    }
    const html = parser.parse(String(markdown || ""), {
      async: false,
      breaks: false,
      gfm: true,
      renderer
    });
    if (typeof html !== "string") return null;
    return sanitizer.sanitize(html, {
      ADD_ATTR: ["data-footnote-backref", "data-footnote-ref", "data-footnotes", "encoding", "target"],
      ADD_TAGS: ["annotation", "semantics"],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/)|#|(?:\.{1,2}\/)?(?![a-z][a-z0-9+.-]*:|\/\/|\\)[^\s<>]+$)/i,
      FORBID_TAGS: ["button", "embed", "form", "iframe", "input", "object", "option", "script", "select", "style", "textarea"]
    });
  } catch {
    return null;
  }
}

function safeRenderedUrl(value, imageOnly) {
  const url = String(value || "").trim().replace(/\s/g, "%20").replace(/\)/g, "%29");
  if (/^https?:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]+$/.test(url)) return url;
  if (!imageOnly && (/^mailto:[^\s]+$/i.test(url) || /^#[^\s]+$/.test(url))) return url;
  if (/^(?:\.{1,2}\/)?(?![a-z][a-z0-9+.-]*:|\/\/|\\)[^\s<>]+$/i.test(url)) return url;
  return "";
}

function renderBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    output.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const quote = /^>\s+(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      return;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  return output.join("");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  const images = [];
  html = html.replace(
    /!\[([^\]]*)\]\(((?:https?:\/\/|\/(?!\/))[^)\s]+)\)/gi,
    (_match, alt, url) => {
      const token = `@@TOMFNG_IMAGE_${images.length}@@`;
      images.push(`<img src="${url}" alt="${alt}" loading="lazy" decoding="async">`);
      return token;
    }
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  html = html.replace(/@@TOMFNG_IMAGE_(\d+)@@/g, (_match, index) => images[Number(index)] || "");
  return html;
}

function createHtmlToMarkdown(TurndownService, gfmPlugin = {}) {
  if (typeof TurndownService !== "function") return null;
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**"
  });

  const plugins = [gfmPlugin.highlightedCodeBlock, gfmPlugin.taskListItems].filter((plugin) => typeof plugin === "function");
  if (plugins.length) service.use(plugins);

  service.addRule("tomfngSafeLink", {
    filter: "a",
    replacement(content, node) {
      const url = safeClipboardUrl(node.getAttribute("href"), false);
      return url && content ? `[${content}](${url})` : content;
    }
  });
  service.addRule("tomfngSafeImage", {
    filter: "img",
    replacement(_content, node) {
      const url = safeClipboardUrl(node.getAttribute("src"), true);
      if (!url) return "";
      const alt = String(node.getAttribute("alt") || "图片")
        .replace(/([\\\[\]])/g, "\\$1")
        .replace(/[\r\n]+/g, " ")
        .trim() || "图片";
      return `![${alt}](${url})`;
    }
  });
  service.addRule("tomfngStrikethrough", {
    filter: ["del", "s", "strike"],
    replacement(content) {
      return content ? `~~${content}~~` : "";
    }
  });
  service.addRule("tomfngTable", {
    filter: "table",
    replacement(_content, node) {
      return htmlTableToMarkdown(node);
    }
  });

  return (html) => service.turndown(String(html || ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeClipboardUrl(value, imageOnly) {
  const url = String(value || "").trim().replace(/\s/g, "%20").replace(/\)/g, "%29");
  if (/^https?:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]+$/.test(url)) return url;
  if (!imageOnly && (/^mailto:[^\s]+$/i.test(url) || /^#[^\s]+$/.test(url))) return url;
  return "";
}

function findMarkdownLinkAt(line, ch) {
  const value = String(line || "");
  const cursor = Math.max(0, Math.min(value.length, Number(ch) || 0));

  for (let open = 0; open < value.length; open += 1) {
    if (value[open] !== "[" || isEscapedMarkdownCharacter(value, open) || value[open - 1] === "!") continue;
    const labelClose = findBalancedMarkdownDelimiter(value, open, "[", "]");
    if (labelClose < 0 || value[labelClose + 1] !== "(") continue;
    const destinationClose = findBalancedMarkdownDelimiter(value, labelClose + 1, "(", ")");
    if (destinationClose < 0) continue;
    if (cursor < open || cursor > destinationClose + 1) {
      open = destinationClose;
      continue;
    }

    const destination = parseMarkdownLinkDestination(value.slice(labelClose + 2, destinationClose));
    return {
      from: open,
      to: destinationClose + 1,
      label: unescapeMarkdownLinkText(value.slice(open + 1, labelClose)),
      url: destination.url,
      titleSuffix: destination.titleSuffix
    };
  }
  return null;
}

function findBalancedMarkdownDelimiter(value, open, opening, closing) {
  let depth = 1;
  for (let index = open + 1; index < value.length; index += 1) {
    if (isEscapedMarkdownCharacter(value, index)) continue;
    if (value[index] === opening) depth += 1;
    if (value[index] !== closing) continue;
    depth -= 1;
    if (!depth) return index;
  }
  return -1;
}

function parseMarkdownLinkDestination(raw) {
  const value = String(raw || "");
  const leading = /^\s*/.exec(value)?.[0].length || 0;
  const content = value.slice(leading);
  if (!content) return { url: "", titleSuffix: "" };

  if (content[0] === "<") {
    for (let index = 1; index < content.length; index += 1) {
      if (content[index] !== ">" || isEscapedMarkdownCharacter(content, index)) continue;
      return {
        url: unescapeMarkdownLinkText(content.slice(1, index)),
        titleSuffix: content.slice(index + 1)
      };
    }
  }

  let end = 0;
  while (end < content.length && !/\s/.test(content[end])) {
    if (content[end] === "\\" && end + 1 < content.length) end += 1;
    end += 1;
  }
  return {
    url: unescapeMarkdownLinkText(content.slice(0, end)),
    titleSuffix: content.slice(end)
  };
}

function unescapeMarkdownLinkText(value) {
  return String(value || "").replace(/\\([\\[\]()<>])/g, "$1");
}

function normalizeMarkdownLinkUrl(value) {
  const input = String(value || "").trim();
  if (!input || /[\r\n\t<>\\]/.test(input)) return "";
  const url = input.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  if (/^(?:https?:\/\/|mailto:)[^\s]+$/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || /^\/\//.test(url)) return "";
  if (/^(?:#|\/(?!\/)|\.\.?\/)?[^\s]+$/.test(url)) return url;
  return "";
}

function formatMarkdownLink(label, url, titleSuffix = "") {
  const text = String(label || "")
    .replace(/\\/g, "\\\\")
    .replace(/([\[\]])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
  const destination = normalizeMarkdownLinkUrl(url);
  if (!text.trim() || !destination) return "";
  return `[${text}](${destination}${String(titleSuffix || "")})`;
}

function htmlTableToMarkdown(table) {
  const rows = Array.from(table.rows || []);
  if (!rows.length) return "";
  const cells = rows.map((row) => Array.from(row.cells || []).map((cell) => String(cell.textContent || "")
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, "<br>")));
  const width = Math.max(...cells.map((row) => row.length));
  if (!width) return "";
  const renderRow = (row) => `| ${Array.from({ length: width }, (_item, index) => row[index] || "").join(" | ")} |`;
  return `\n\n${renderRow(cells[0])}\n${renderRow(Array(width).fill("---"))}${cells.slice(1).map((row) => `\n${renderRow(row)}`).join("")}\n\n`;
}

function markdownTableCells(line) {
  const value = String(line || "");
  let from = 0;
  let to = value.length;
  while (from < to && /\s/.test(value[from])) from += 1;
  while (to > from && /\s/.test(value[to - 1])) to -= 1;

  let hasBoundaryPipe = false;
  if (value[from] === "|") {
    hasBoundaryPipe = true;
    from += 1;
  }
  if (to > from && value[to - 1] === "|" && !isEscapedMarkdownCharacter(value, to - 1)) {
    hasBoundaryPipe = true;
    to -= 1;
  }

  const cells = [];
  let cellFrom = from;
  let delimiters = 0;
  let codeTicks = 0;
  for (let index = from; index < to; index += 1) {
    const char = value[index];
    if (char === "`" && !isEscapedMarkdownCharacter(value, index)) {
      let run = 1;
      while (value[index + run] === "`") run += 1;
      if (!codeTicks) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      index += run - 1;
      continue;
    }
    if (char !== "|" || codeTicks || isEscapedMarkdownCharacter(value, index)) continue;
    cells.push(markdownTableCell(value, cellFrom, index));
    cellFrom = index + 1;
    delimiters += 1;
  }
  cells.push(markdownTableCell(value, cellFrom, to));

  return {
    cells,
    isRow: hasBoundaryPipe || delimiters > 0
  };
}

function markdownTableCell(line, from, to) {
  const raw = line.slice(from, to);
  const leading = /^\s*/.exec(raw)?.[0].length || 0;
  const trailing = /\s*$/.exec(raw)?.[0].length || 0;
  return {
    text: raw.trim(),
    from,
    to,
    contentFrom: Math.min(to, from + leading),
    contentTo: Math.max(from, to - trailing)
  };
}

function isEscapedMarkdownCharacter(value, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function markdownTableAlignment(cell) {
  const marker = String(cell?.text || "").replace(/\s+/g, "");
  const match = /^(:)?-{3,}(:)?$/.exec(marker);
  if (!match) return null;
  if (match[1] && match[2]) return "center";
  if (match[2]) return "right";
  if (match[1]) return "left";
  return "none";
}

function findMarkdownTable(lines, cursor = {}) {
  const values = Array.from(lines || [], (line) => String(line || ""));
  const cursorLine = Math.max(0, Math.min(values.length - 1, Math.floor(Number(cursor.line) || 0)));
  if (!values.length || !markdownTableCells(values[cursorLine]).isRow) return null;

  let blockFrom = cursorLine;
  let blockTo = cursorLine;
  while (blockFrom > 0 && markdownTableCells(values[blockFrom - 1]).isRow) blockFrom -= 1;
  while (blockTo + 1 < values.length && markdownTableCells(values[blockTo + 1]).isRow) blockTo += 1;

  let separatorLine = -1;
  let separator = null;
  for (let line = Math.max(blockFrom + 1, 1); line <= blockTo; line += 1) {
    const parsed = markdownTableCells(values[line]);
    if (parsed.cells.length && parsed.cells.every((cell) => markdownTableAlignment(cell) !== null)) {
      separatorLine = line;
      separator = parsed;
      break;
    }
  }
  if (!separator) return null;

  const fromLine = separatorLine - 1;
  let toLine = separatorLine;
  while (toLine + 1 < values.length && markdownTableCells(values[toLine + 1]).isRow) toLine += 1;
  if (cursorLine < fromLine || cursorLine > toLine) return null;

  const parsedRows = [markdownTableCells(values[fromLine])];
  for (let line = separatorLine + 1; line <= toLine; line += 1) {
    parsedRows.push(markdownTableCells(values[line]));
  }
  const columnCount = Math.max(separator.cells.length, ...parsedRows.map((row) => row.cells.length));
  if (!columnCount) return null;
  const cursorCells = markdownTableCells(values[cursorLine]).cells;
  const cursorCh = Math.max(0, Math.floor(Number(cursor.ch) || 0));
  let column = cursorCells.findIndex((cell) => cursorCh <= cell.to);
  if (column < 0) column = cursorCells.length - 1;
  column = Math.max(0, Math.min(columnCount - 1, column));

  const alignments = Array.from({ length: columnCount }, (_item, index) => (
    markdownTableAlignment(separator.cells[index]) || "none"
  ));
  return {
    values,
    fromLine,
    toLine,
    separatorLine,
    parsedRows,
    alignments,
    columnCount,
    column,
    rowType: cursorLine === fromLine ? "header" : cursorLine === separatorLine ? "separator" : "body",
    cursorLine
  };
}

function getMarkdownTableContext(lines, cursor = {}) {
  const table = findMarkdownTable(lines, cursor);
  if (!table) return null;
  return {
    fromLine: table.fromLine,
    toLine: table.toLine,
    separatorLine: table.separatorLine,
    rowType: table.rowType,
    rowCount: Math.max(0, table.parsedRows.length - 1),
    columnCount: table.columnCount,
    column: table.column,
    alignment: table.alignments[table.column]
  };
}

function editMarkdownTable(lines, cursor, action, value = "") {
  const table = findMarkdownTable(lines, cursor);
  if (!table) return null;

  const rows = table.parsedRows.map((row) => (
    Array.from({ length: table.columnCount }, (_item, index) => row.cells[index]?.text || "")
  ));
  const alignments = [...table.alignments];
  let targetRowType = table.rowType;
  let targetBodyIndex = table.rowType === "body" ? table.cursorLine - table.separatorLine - 1 : -1;
  let targetColumn = table.column;

  if (action === "add-row") {
    const insertAt = targetBodyIndex < 0 ? 1 : targetBodyIndex + 2;
    rows.splice(insertAt, 0, Array(table.columnCount).fill(""));
    targetRowType = "body";
    targetBodyIndex = insertAt - 1;
  } else if (action === "delete-row") {
    if (targetBodyIndex < 0) return null;
    rows.splice(targetBodyIndex + 1, 1);
    if (rows.length > 1) {
      targetBodyIndex = Math.min(targetBodyIndex, rows.length - 2);
      targetRowType = "body";
    } else {
      targetBodyIndex = -1;
      targetRowType = "header";
    }
  } else if (action === "add-column") {
    targetColumn = Math.min(table.columnCount, table.column + 1);
    rows.forEach((row) => row.splice(targetColumn, 0, ""));
    alignments.splice(targetColumn, 0, "none");
  } else if (action === "delete-column") {
    if (table.columnCount <= 1) return null;
    rows.forEach((row) => row.splice(table.column, 1));
    alignments.splice(table.column, 1);
    targetColumn = Math.min(table.column, alignments.length - 1);
  } else if (action === "align") {
    if (!new Set(["none", "left", "center", "right"]).has(value)) return null;
    alignments[table.column] = value;
  } else {
    return null;
  }

  const renderRow = (row) => `| ${row.join(" | ")} |`;
  const renderAlignment = (alignment) => {
    if (alignment === "left") return ":---";
    if (alignment === "center") return ":---:";
    if (alignment === "right") return "---:";
    return "---";
  };
  const rendered = [
    renderRow(rows[0]),
    renderRow(alignments.map(renderAlignment)),
    ...rows.slice(1).map(renderRow)
  ];
  const relativeLine = targetRowType === "header"
    ? 0
    : targetRowType === "separator"
      ? 1
      : targetBodyIndex + 2;
  const targetCells = markdownTableCells(rendered[relativeLine]).cells;
  const targetCell = targetCells[Math.max(0, Math.min(targetColumn, targetCells.length - 1))];
  const ch = targetCell.text ? targetCell.contentFrom : Math.min(targetCell.to, targetCell.from + 1);

  return {
    fromLine: table.fromLine,
    toLine: table.toLine,
    lines: rendered,
    cursor: { line: table.fromLine + relativeLine, ch }
  };
}

function extractMarkdownHeadings(markdown = "") {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  let fence = "";

  for (let line = 0; line < lines.length; line += 1) {
    const value = lines[line];
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(value);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = "";
      continue;
    }
    if (fence) continue;

    const atx = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(value);
    if (atx) {
      headings.push({ line, level: atx[1].length, text: cleanHeadingText(atx[2]) });
      continue;
    }

    const underline = line + 1 < lines.length ? /^ {0,3}(=+|-+)\s*$/.exec(lines[line + 1]) : null;
    if (underline && value.trim() && !/^\s*[>|]/.test(value)) {
      headings.push({ line, level: underline[1][0] === "=" ? 1 : 2, text: cleanHeadingText(value) });
      line += 1;
    }
  }
  return headings.filter((heading) => heading.text);
}

function cleanHeadingText(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function normalizeEditorViewState(value) {
  const source = value && typeof value === "object" ? value : {};
  const notesSource = source.notes && typeof source.notes === "object" ? source.notes : {};
  const notes = {};
  const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);
  Object.entries(notesSource).slice(-50).forEach(([rawId, rawView]) => {
    const id = String(rawId || "").trim();
    if (!id || blockedKeys.has(id) || !rawView || typeof rawView !== "object") return;
    notes[id] = {
      cursor: normalizeEditorPoint(rawView.cursor),
      scrollTop: nonNegativeNumber(rawView.scrollTop),
      scrollLeft: nonNegativeNumber(rawView.scrollLeft),
      pageScrollY: nonNegativeNumber(rawView.pageScrollY)
    };
  });

  const rawCategory = String(source.category || "all").trim();
  return {
    version: 1,
    selectedId: String(source.selectedId || ""),
    category: rawCategory === "all" ? "all" : normalizeCategory(rawCategory),
    sidebarMode: source.sidebarMode === "outline" ? "outline" : "pages",
    notes
  };
}

function normalizeEditorPoint(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    line: Math.floor(nonNegativeNumber(source.line)),
    ch: Math.floor(nonNegativeNumber(source.ch))
  };
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function filterNotesByQuery(notes, query) {
  const terms = String(query || "")
    .toLocaleLowerCase("zh-CN")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const values = Array.from(notes || []);
  if (!terms.length) return values;
  return values.filter((note) => {
    const haystack = [
      note?.title,
      note?.category,
      ...(Array.isArray(note?.tags) ? note.tags : []),
      note?.summary,
      note?.content
    ].map((value) => String(value || "").toLocaleLowerCase("zh-CN")).join("\n");
    return terms.every((term) => haystack.includes(term));
  });
}

function parseMarkdownSlashContext(line, cursorCh) {
  const value = String(line || "");
  const cursor = Math.min(value.length, Math.max(0, Math.floor(Number(cursorCh) || 0)));
  if (value.slice(cursor).trim()) return null;
  const match = /^( {0,3})\/([^/\n]*)$/.exec(value.slice(0, cursor));
  if (!match) return null;
  return {
    fromCh: match[1].length,
    toCh: cursor,
    query: match[2].trim()
  };
}

function stripMarkdownBlockPrefix(line) {
  const value = String(line || "");
  const indent = /^\s*/.exec(value)?.[0] || "";
  const content = value.slice(indent.length)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/^(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "");
  return `${indent}${content}`;
}

function transformMarkdownBlockLines(lines, command) {
  const values = Array.from(lines || [], (line) => String(line || ""));
  const meaningful = values.filter((line) => line.trim());
  const allTarget = meaningful.length > 0 && meaningful.every((line) => lineMatchesBlockCommand(line, command));
  let order = 0;
  return values.map((line) => {
    if (!line.trim() && values.length > 1) return line;
    if (line.trim()) order += 1;
    const indent = /^\s*/.exec(line)?.[0] || "";
    const rawContent = line.slice(indent.length);
    const content = allTarget
      ? removeTargetBlockPrefix(rawContent, command)
      : stripMarkdownBlockPrefix(line).trimStart();
    const prefix = allTarget ? "" : markdownBlockPrefix(command, Math.max(0, order - 1));
    return `${indent}${prefix}${content}`;
  });
}

function lineMatchesBlockCommand(line, command) {
  const content = String(line || "").trimStart();
  if (command === "bullet-list") return /^[-+*]\s+(?!\[[ xX]\]\s+)/.test(content);
  if (command === "ordered-list") return /^\d+[.)]\s+/.test(content);
  if (command === "task-list") return /^[-+*]\s+\[[ xX]\]\s+/.test(content);
  if (command === "quote") return /^>\s+/.test(content);
  return false;
}

function markdownBlockPrefix(command, index) {
  if (command === "bullet-list") return "- ";
  if (command === "ordered-list") return `${index + 1}. `;
  if (command === "task-list") return "- [ ] ";
  if (command === "quote") return "> ";
  return "";
}

function removeTargetBlockPrefix(content, command) {
  if (command === "bullet-list") return content.replace(/^[-+*]\s+/, "");
  if (command === "ordered-list") return content.replace(/^\d+[.)]\s+/, "");
  if (command === "task-list") return content.replace(/^[-+*]\s+\[[ xX]\]\s+/, "");
  if (command === "quote") return content.replace(/^>\s+/, "");
  return content;
}

function toggleMarkdownTask(line) {
  const value = String(line || "");
  const match = /^((?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[)([ xX])(\])/.exec(value);
  if (!match) return null;
  const checked = !/[xX]/.test(match[2]);
  const stateCh = match[1].length;
  return {
    line: `${value.slice(0, stateCh)}${checked ? "x" : " "}${value.slice(stateCh + 1)}`,
    checked,
    stateCh
  };
}

function markdownFootnoteTemplate(markdown = "", selected = "") {
  let number = 0;
  const source = String(markdown || "");
  const pattern = /\[\^(\d+)\]/g;
  let match = pattern.exec(source);
  while (match) {
    number = Math.max(number, Number(match[1]) || 0);
    match = pattern.exec(source);
  }
  const label = String(number + 1);
  const content = String(selected || "").trim() || "脚注内容";
  const definitionText = content.replace(/\n/g, "\n    ");
  const definition = `[^${label}]: ${definitionText}`;
  const selectionStart = definition.indexOf(definitionText);
  return {
    reference: `[^${label}]`,
    definition,
    selectionStart,
    selectionEnd: definition.length
  };
}

function markdownBlockTemplate(command, selected = "") {
  const selection = String(selected || "");
  if (command === "mermaid") {
    const diagram = selection || "graph TD\n  A[开始] --> B[完成]";
    const body = `\`\`\`mermaid\n${diagram}\n\`\`\``;
    const start = body.indexOf(diagram);
    return { body, selectionStart: start, selectionEnd: start + diagram.length };
  }
  if (command === "code-block") {
    const body = selection ? `\`\`\`\n${selection}\n\`\`\`` : "```\n\n```";
    const start = body.indexOf("\n") + 1;
    return { body, selectionStart: start, selectionEnd: start + selection.length };
  }
  if (command === "math-block") {
    const expression = selection || "E = mc^2";
    const body = `$$\n${expression}\n$$`;
    const start = body.indexOf("\n") + 1;
    return { body, selectionStart: start, selectionEnd: start + expression.length };
  }
  if (command === "table") {
    const body = [
      "| 列 1 | 列 2 | 列 3 |",
      "| --- | --- | --- |",
      "|     |     |     |",
      "|     |     |     |"
    ].join("\n");
    const start = body.indexOf("列 1");
    return { body, selectionStart: start, selectionEnd: start + "列 1".length };
  }
  if (command === "horizontal-rule") return { body: "---", selectionStart: 3, selectionEnd: 3 };
  return null;
}

window.TomfngNoteTools = {
  createHtmlToMarkdown,
  escapeHtml,
  extractMarkdownHeadings,
  filterNotesByQuery,
  findMarkdownLinkAt,
  formatMarkdownLink,
  formatDate,
  getMarkdownTableContext,
  makeId,
  makeSlug,
  markdownToHtml,
  markdownBlockTemplate,
  markdownFootnoteTemplate,
  editMarkdownTable,
  mergeRemotePosts,
  noteContentFingerprint,
  normalizeCategory,
  normalizeEditorViewState,
  normalizeMarkdownLinkUrl,
  normalizeNote,
  normalizeNotesData,
  normalizeTags,
  parseMarkdownSlashContext,
  stripMarkdownBlockPrefix,
  toggleMarkdownTask,
  transformMarkdownBlockLines
};
}());
