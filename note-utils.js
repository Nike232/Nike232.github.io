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

window.TomfngNoteTools = {
  createHtmlToMarkdown,
  escapeHtml,
  formatDate,
  makeId,
  makeSlug,
  markdownToHtml,
  mergeRemotePosts,
  noteContentFingerprint,
  normalizeCategory,
  normalizeNote,
  normalizeNotesData,
  normalizeTags
};
}());
