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

function markdownBlockTemplate(command, selected = "") {
  const selection = String(selected || "");
  if (command === "code-block") {
    const body = selection ? `\`\`\`\n${selection}\n\`\`\`` : "```\n\n```";
    const start = body.indexOf("\n") + 1;
    return { body, selectionStart: start, selectionEnd: start + selection.length };
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
  formatDate,
  makeId,
  makeSlug,
  markdownToHtml,
  markdownBlockTemplate,
  mergeRemotePosts,
  noteContentFingerprint,
  normalizeCategory,
  normalizeEditorViewState,
  normalizeNote,
  normalizeNotesData,
  normalizeTags,
  parseMarkdownSlashContext,
  stripMarkdownBlockPrefix,
  transformMarkdownBlockLines
};
}());
