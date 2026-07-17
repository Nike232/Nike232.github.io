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
  const frontMatter = note.frontMatter && typeof note.frontMatter === "object" ? note.frontMatter : {};
  const remotePath = String(note.remotePath || "");
  const draftRemote = isRemoteDraftPath(remotePath);
  const status = draftRemote || note.status !== "published" ? "draft" : "published";
  const parentId = String(note.parentId || frontMatter.admin_parent || "").trim();
  return {
    id: String(note.id || makeId()),
    title,
    slug: String(note.slug || makeSlug(title)).trim(),
    category: normalizeCategory(note.category),
    summary: String(note.summary || "").trim(),
    tags: normalizeTags(note.tags),
    status,
    parentId: parentId === String(note.id || "") ? "" : parentId,
    content: String(note.content || ""),
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now,
    remotePath,
    remoteSha: String(note.remoteSha || ""),
    localDirty: Boolean(note.localDirty),
    parseError: String(note.parseError || ""),
    frontMatter
  };
}

function isRemoteDraftPath(path = "") {
  const value = String(path || "").replace(/\\/g, "/");
  return /(^|\/)_drafts\//.test(value);
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
    parentId: String(note?.parentId || "").trim(),
    summary: String(note?.summary || "").trim(),
    content: String(note?.content || "").replace(/\r\n/g, "\n").trim()
  });
}

function mergeRemotePosts(localData, remoteData) {
  const localNotes = normalizeNotesData(localData || { notes: [] }).notes;
  const remoteNotes = normalizeNotesData(remoteData || { notes: [] }).notes.map((note) => {
    const path = String(note.remotePath || "");
    const draft = isRemoteDraftPath(path) || note.status === "draft";
    return normalizeNote({
      ...note,
      status: draft ? "draft" : "published",
      localDirty: false
    });
  });
  const remoteByPath = new Map(remoteNotes.filter((note) => note.remotePath).map((note) => [note.remotePath, note]));
  const remoteById = new Map(remoteNotes.map((note) => [note.id, note]));
  const remoteBySlug = new Map(
    remoteNotes
      .filter((note) => note.status === "published" && !isRemoteDraftPath(note.remotePath))
      .map((note) => [String(note.slug || "").toLowerCase(), note])
  );
  const consumedIds = new Set();
  const consumedPaths = new Set();
  const markConsumed = (remote) => {
    if (remote?.id) consumedIds.add(remote.id);
    if (remote?.remotePath) consumedPaths.add(remote.remotePath);
  };
  const isConsumed = (remote) => (
    Boolean(remote?.id && consumedIds.has(remote.id))
    || Boolean(remote?.remotePath && consumedPaths.has(remote.remotePath))
  );
  const merged = [];
  let preserved = 0;

  localNotes.forEach((local) => {
    const remote = (local.remotePath && remoteByPath.get(local.remotePath))
      || remoteById.get(local.id)
      || (local.status === "published" && !isRemoteDraftPath(local.remotePath)
        && remoteBySlug.get(String(local.slug || "").toLowerCase()));
    if (remote && !isConsumed(remote)) {
      markConsumed(remote);
      const same = noteContentFingerprint(local) === noteContentFingerprint(remote);
      const keepLocal = !same && (local.localDirty || !local.remoteSha);
      if (keepLocal) {
        preserved += 1;
        merged.push(normalizeNote({
          ...local,
          id: remote.id || local.id,
          status: remote.status,
          parentId: local.parentId || remote.parentId,
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
    if (!isConsumed(remote)) merged.push(remote);
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
    const size = parseMarkdownImageSize(title ? ` ${title}` : "");
    // marked may pass title without leading space; also accept raw "=420".
    const sized = size.width
      ? size
      : parseMarkdownImageSize(title || "");
    const titleAttribute = sized.width
      ? ""
      : (title ? ` title="${escapeHtml(title)}"` : "");
    const widthAttribute = sized.width
      ? ` width="${sized.width}" style="width:${sized.width}px;max-width:100%;height:auto"`
      : "";
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text || "")}" loading="lazy" decoding="async"${titleAttribute}${widthAttribute}>`;
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
  const resource = findMarkdownInlineResourceAt(line, ch, false);
  if (!resource) return null;
  return resource;
}

function findMarkdownImageAt(line, ch) {
  const resource = findMarkdownInlineResourceAt(line, ch, true);
  if (!resource) return null;
  const { label, ...image } = resource;
  return { ...image, alt: label };
}

function findMarkdownInlineResourceAt(line, ch, imageOnly) {
  const value = String(line || "");
  const cursor = Math.max(0, Math.min(value.length, Number(ch) || 0));

  for (let open = 0; open < value.length; open += 1) {
    if (value[open] !== "[" || isEscapedMarkdownCharacter(value, open)) continue;
    const isImage = value[open - 1] === "!" && !isEscapedMarkdownCharacter(value, open - 1);
    if (isImage !== imageOnly) continue;
    const labelClose = findBalancedMarkdownDelimiter(value, open, "[", "]");
    if (labelClose < 0 || value[labelClose + 1] !== "(") continue;
    const destinationClose = findBalancedMarkdownDelimiter(value, labelClose + 1, "(", ")");
    if (destinationClose < 0) continue;
    const resourceFrom = isImage ? open - 1 : open;
    if (cursor < resourceFrom || cursor > destinationClose + 1) {
      open = destinationClose;
      continue;
    }

    const destination = parseMarkdownLinkDestination(value.slice(labelClose + 2, destinationClose));
    return {
      from: resourceFrom,
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

function normalizeMarkdownImageUrl(value) {
  const url = normalizeMarkdownLinkUrl(value);
  if (!url || /^(?:mailto:|#)/i.test(url)) return "";
  return url;
}

function escapeMarkdownInlineLabel(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/([\[\]])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
}

function formatMarkdownLink(label, url, titleSuffix = "") {
  const text = escapeMarkdownInlineLabel(label);
  const destination = normalizeMarkdownLinkUrl(url);
  if (!text.trim() || !destination) return "";
  return `[${text}](${destination}${String(titleSuffix || "")})`;
}

function formatMarkdownImage(alt, url, titleSuffix = "") {
  const destination = normalizeMarkdownImageUrl(url);
  if (!destination) return "";
  return `![${escapeMarkdownInlineLabel(alt)}](${destination}${String(titleSuffix || "")})`;
}

function parseMarkdownImageSize(titleSuffix = "") {
  const raw = String(titleSuffix || "");
  // Canonical Typora-ish: " =420" or " =420x240" (optionally quoted).
  const sizeMatch = /^\s*=\s*(\d{2,4})(?:x\d{0,4})?\s*$/.exec(raw)
    || /^\s*"=\s*(\d{2,4})(?:x\d{0,4})?"\s*$/.exec(raw)
    || /^\s*"w=(\d{2,4})"\s*$/i.exec(raw)
    || /^=\s*(\d{2,4})(?:x\d{0,4})?$/.exec(raw.trim());
  if (!sizeMatch) {
    return { width: null, restTitleSuffix: raw };
  }
  const width = Math.max(40, Math.min(2400, Number(sizeMatch[1]) || 0));
  if (!width) return { width: null, restTitleSuffix: raw };
  return { width, restTitleSuffix: "" };
}

function formatMarkdownImageSize(titleSuffix = "", width) {
  const size = Math.round(Number(width) || 0);
  if (!Number.isFinite(size) || size < 40) {
    const parsed = parseMarkdownImageSize(titleSuffix);
    return parsed.restTitleSuffix;
  }
  const clamped = Math.max(80, Math.min(1600, size));
  const parsed = parseMarkdownImageSize(titleSuffix);
  const rest = String(parsed.restTitleSuffix || "").trim();
  if (rest && !/^=/.test(rest)) {
    // Keep a human title and append size only if rest looks like a quoted title.
    if (/^".*"$/.test(rest) || /^'.*'$/.test(rest)) {
      return ` ${rest} =${clamped}`;
    }
  }
  return ` =${clamped}`;
}

function markdownSoftBreakInsert(line, ch) {
  const value = String(line || "");
  const cursor = Math.max(0, Math.min(value.length, Math.floor(Number(ch) || 0)));
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  // Already a GFM hard break at the insert point.
  if (/ {2}$/.test(before) || /\\$/.test(before)) {
    return {
      from: cursor,
      to: cursor,
      text: "\n",
      cursor: 0
    };
  }
  return {
    from: cursor,
    to: cursor,
    text: "  \n",
    cursor: 0
  };
}

function lineHasGfmHardBreak(line) {
  return / {2}$/.test(String(line || "")) || /\\$/.test(String(line || ""));
}

function markdownPairInputEdit(line, fromCh, toCh, key) {
  const value = String(line || "");
  const from = Math.max(0, Math.min(value.length, Math.floor(Number(fromCh) || 0)));
  const to = Math.max(from, Math.min(value.length, Math.floor(Number(toCh) || 0)));
  const marker = String(key || "");
  if (!["*", "_", "~", "`", "$"].includes(marker)) return null;

  const selected = value.slice(from, to);
  if (selected) {
    const pair = marker === "~" ? "~~" : marker;
    return {
      type: "replace",
      from,
      to,
      text: `${pair}${selected}${pair}`,
      selectionStart: pair.length,
      selectionEnd: pair.length + selected.length
    };
  }

  const before = value.slice(0, from);
  const after = value.slice(to);
  if (marker === "$" && before === "$" && after === "$") {
    return {
      type: "replace",
      from: 0,
      to: value.length,
      text: "$$\n\n$$",
      selectionStart: 3,
      selectionEnd: 3
    };
  }
  if (marker === "`" && /^\s*`{0,2}$/.test(before) && !after.trim()) {
    if (before.endsWith("``")) {
      return {
        type: "replace",
        from: 0,
        to: value.length,
        text: "```\n\n```",
        selectionStart: 4,
        selectionEnd: 4
      };
    }
    return null;
  }
  if (after.startsWith(marker)) {
    return { type: "skip", cursor: from + marker.length };
  }
  if (marker === "`" || marker === "$") {
    return {
      type: "replace",
      from,
      to,
      text: marker + marker,
      selectionStart: marker.length,
      selectionEnd: marker.length
    };
  }

  if (
    before.endsWith(marker)
    && !isEscapedMarkdownCharacter(value, from - 1)
    && countUnescapedMarkdownMarker(before, marker) % 2 === 1
  ) {
    return {
      type: "replace",
      from,
      to,
      text: marker.repeat(3),
      selectionStart: marker.length,
      selectionEnd: marker.length
    };
  }
  return null;
}

function markdownPairBackspaceEdit(line, ch) {
  const value = String(line || "");
  const cursor = Math.max(0, Math.min(value.length, Math.floor(Number(ch) || 0)));
  const marker = value[cursor - 1];
  if (!["*", "_", "~", "`", "$"].includes(marker) || value[cursor] !== marker) return null;
  const doubled = value.slice(cursor - 2, cursor) === marker.repeat(2)
    && value.slice(cursor, cursor + 2) === marker.repeat(2);
  const width = doubled ? 2 : 1;
  return {
    type: "replace",
    from: cursor - width,
    to: cursor + width,
    text: "",
    selectionStart: 0,
    selectionEnd: 0
  };
}

function countUnescapedMarkdownMarker(value, marker) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === marker && !isEscapedMarkdownCharacter(value, index)) count += 1;
  }
  return count;
}

function markdownListBackspaceEdit(line, ch) {
  const value = String(line || "");
  const cursor = Math.max(0, Math.min(value.length, Math.floor(Number(ch) || 0)));
  const match = /^([ \t]*)(#{1,6}[ \t]+|>[ \t]+|(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/.exec(value);
  if (!match) return null;

  const indent = match[1];
  const marker = match[2];
  const prefixEnd = indent.length + marker.length;
  if (cursor !== prefixEnd) return null;

  if (indent.length > 0) {
    let remove = 0;
    if (indent.endsWith("\t")) remove = 1;
    else if (indent.endsWith("  ")) remove = 2;
    else if (indent.endsWith(" ")) remove = 1;
    else return null;
    const nextIndent = indent.slice(0, -remove);
    return {
      type: "replace",
      from: 0,
      to: indent.length,
      text: nextIndent,
      selectionStart: nextIndent.length + marker.length,
      selectionEnd: nextIndent.length + marker.length
    };
  }

  return {
    type: "replace",
    from: 0,
    to: prefixEnd,
    text: "",
    selectionStart: 0,
    selectionEnd: 0
  };
}

function markdownEmptyBlockEnterEdit(line) {
  const value = String(line || "");
  const heading = /^([ \t]*)(#{1,6})[ \t]*$/.exec(value);
  if (!heading) return null;
  return {
    text: heading[1],
    cursor: heading[1].length
  };
}

function markdownListJoinBackspaceEdit(prevLine, line) {
  const previous = String(prevLine || "");
  const current = String(line || "");
  const marker = /^([ \t]*)(#{1,6}[ \t]+|>[ \t]+|(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/;
  const currentMatch = marker.exec(current);
  // Join only when the current line is a structural block item (including empty ones).
  // Plain paragraphs at ch=0 keep default CodeMirror join behavior.
  if (!currentMatch) return null;
  const content = current.slice(currentMatch[0].length);
  return {
    type: "replace",
    previousText: previous + content,
    selectionStart: previous.length,
    selectionEnd: previous.length
  };
}

function renumberMarkdownOrderedList(lines, pivotLine = 0) {
  const values = Array.from(lines || [], (line) => String(line || ""));
  if (!values.length) return null;
  const ordered = /^([ \t]*)(\d+)([.)])([ \t]+)(.*)$/;
  let probe = Math.max(0, Math.min(values.length - 1, Math.floor(Number(pivotLine) || 0)));
  if (!ordered.test(values[probe])) {
    if (probe > 0 && ordered.test(values[probe - 1])) probe -= 1;
    else if (probe + 1 < values.length && ordered.test(values[probe + 1])) probe += 1;
    else return null;
  }

  const seed = ordered.exec(values[probe]);
  if (!seed) return null;
  const indent = seed[1];
  let fromLine = probe;
  let toLine = probe;
  while (fromLine > 0) {
    const match = ordered.exec(values[fromLine - 1]);
    if (!match || match[1] !== indent) break;
    fromLine -= 1;
  }
  while (toLine + 1 < values.length) {
    const match = ordered.exec(values[toLine + 1]);
    if (!match || match[1] !== indent) break;
    toLine += 1;
  }

  let changed = false;
  const nextLines = [];
  for (let index = fromLine, number = 1; index <= toLine; index += 1, number += 1) {
    const match = ordered.exec(values[index]);
    const rewritten = `${match[1]}${number}${match[3]}${match[4]}${match[5]}`;
    if (rewritten !== values[index]) changed = true;
    nextLines.push(rewritten);
  }
  if (!changed) return null;
  return { fromLine, toLine, lines: nextLines };
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

function markdownTableDataLines(table) {
  const lines = [table.fromLine];
  for (let line = table.separatorLine + 1; line <= table.toLine; line += 1) lines.push(line);
  return lines;
}

function markdownTableCellSelection(lineText, column) {
  const cells = markdownTableCells(lineText).cells;
  if (!cells.length) return null;
  const cell = cells[Math.max(0, Math.min(column, cells.length - 1))];
  return {
    from: cell.contentFrom,
    to: cell.text ? cell.contentTo : cell.contentFrom
  };
}

function markdownTableKeyboardEdit(lines, cursor = {}, action = "next") {
  const table = findMarkdownTable(lines, cursor);
  if (!table) return null;
  const dir = String(action || "next");
  if (!["next", "prev", "up", "down", "enter"].includes(dir)) return null;

  const dataLines = markdownTableDataLines(table);
  let line = table.cursorLine;
  let column = table.column;
  let snappedFromSeparator = false;

  if (line === table.separatorLine) {
    snappedFromSeparator = true;
    // Separator is visually collapsed — land on the nearest real row first.
    if (dir === "up" || dir === "prev") line = table.fromLine;
    else line = dataLines[Math.min(1, dataLines.length - 1)] ?? table.fromLine;
  }

  let rowIndex = dataLines.indexOf(line);
  if (rowIndex < 0) return null;
  let createRow = false;

  if (snappedFromSeparator && (dir === "up" || dir === "down" || dir === "enter")) {
    // Already snapped to the destination row for vertical moves.
  } else if (dir === "next") {
    if (column < table.columnCount - 1) column += 1;
    else if (rowIndex < dataLines.length - 1) {
      rowIndex += 1;
      column = 0;
    } else {
      createRow = true;
      column = 0;
    }
  } else if (dir === "prev") {
    if (column > 0) column -= 1;
    else if (rowIndex > 0) {
      rowIndex -= 1;
      column = table.columnCount - 1;
    } else {
      return null;
    }
  } else if (dir === "enter" || dir === "down") {
    if (rowIndex < dataLines.length - 1) rowIndex += 1;
    else if (dir === "enter") createRow = true;
    else return null;
  } else if (dir === "up") {
    if (rowIndex > 0) rowIndex -= 1;
    else return null;
  }

  if (createRow) {
    const edited = editMarkdownTable(lines, {
      line: table.toLine,
      ch: Math.max(0, Math.floor(Number(cursor.ch) || 0))
    }, "add-row");
    if (!edited) return null;
    const relativeLine = edited.lines.length - 1;
    const targetLine = edited.fromLine + relativeLine;
    const targetColumn = dir === "enter" ? table.column : 0;
    const selection = markdownTableCellSelection(edited.lines[relativeLine], targetColumn);
    if (!selection) return null;
    return {
      fromLine: edited.fromLine,
      toLine: edited.toLine,
      lines: edited.lines,
      selection: {
        from: { line: targetLine, ch: selection.from },
        to: { line: targetLine, ch: selection.to }
      }
    };
  }

  const targetLine = dataLines[rowIndex];
  const selection = markdownTableCellSelection(String(lines[targetLine] || ""), column);
  if (!selection) return null;
  return {
    fromLine: table.fromLine,
    toLine: table.toLine,
    lines: null,
    selection: {
      from: { line: targetLine, ch: selection.from },
      to: { line: targetLine, ch: selection.to }
    }
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
  const rawStatus = String(source.statusFilter || "all").trim().toLowerCase();
  const statusFilter = ["all", "draft", "published", "dirty"].includes(rawStatus) ? rawStatus : "all";
  const rawSort = String(source.sortBy || "updated").trim().toLowerCase();
  const sortBy = ["updated", "created", "title"].includes(rawSort) ? rawSort : "updated";
  const rawTag = String(source.tag || "all").trim();
  const tag = !rawTag || rawTag === "all" ? "all" : rawTag;
  return {
    version: 1,
    selectedId: String(source.selectedId || ""),
    category: rawCategory === "all" ? "all" : normalizeCategory(rawCategory),
    statusFilter,
    sortBy,
    tag,
    sidebarMode: source.sidebarMode === "outline" ? "outline" : "pages",
    notes
  };
}

function getNoteListStatus(note = {}) {
  const path = String(note?.remotePath || "");
  if (!path || isRemoteDraftPath(path) || note?.status === "draft") {
    return note?.localDirty && path ? "dirty" : "draft";
  }
  return note.localDirty ? "dirty" : "published";
}

function normalizeLibraryState(value) {
  const source = value && typeof value === "object" ? value : {};
  const cleanIds = (list, max = 100) => {
    const seen = new Set();
    const result = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      if (result.length >= max) break;
    }
    return result;
  };
  return {
    recentIds: cleanIds(source.recentIds, 20),
    pinnedIds: cleanIds(source.pinnedIds, 50),
    favoriteIds: cleanIds(source.favoriteIds, 100)
  };
}

function touchRecent(library, noteId, max = 20) {
  const state = normalizeLibraryState(library);
  const id = String(noteId || "").trim();
  if (!id) return state;
  return normalizeLibraryState({
    ...state,
    recentIds: [id, ...state.recentIds.filter((item) => item !== id)].slice(0, max)
  });
}

function toggleIdInList(list, noteId) {
  const id = String(noteId || "").trim();
  const values = Array.from(list || [], (item) => String(item || "").trim()).filter(Boolean);
  if (!id) return values;
  return values.includes(id) ? values.filter((item) => item !== id) : [id, ...values];
}

function formatRelativeTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  const current = new Date(now);
  const startOfDay = (input) => new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(current) - startOfDay(date)) / dayMs);
  if (diffDays === 0) {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  if (diffDays === 1) return "昨天";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} 天前`;
  if (diffDays >= 7 && diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function isSafeCoverUrl(url = "") {
  const value = String(url || "").trim();
  if (!value || /[\r\n\f]/.test(value)) return false;
  if (/^(javascript|data|vbscript):/i.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value, "https://tomfng.space");
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractNoteCover(content = "", frontMatter = {}) {
  const fm = frontMatter && typeof frontMatter === "object" ? frontMatter : {};
  const fromFm = String(fm.cover || fm.image || fm.thumbnail || "").trim();
  if (fromFm && isSafeCoverUrl(fromFm)) return fromFm;
  const match = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(String(content || ""));
  if (!match) return "";
  const url = String(match[1] || "").trim();
  if (!isSafeCoverUrl(url)) return "";
  return url;
}

function calendarPartsInTimeZone(value, timeZone = "Asia/Shanghai") {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  if (!parts.year || !parts.month || !parts.day) return null;
  return parts;
}

function publicNoteUrl(note = {}, siteBase = "http://tomfng.space", options = {}) {
  if (isRemoteDraftPath(note.remotePath)) return "";
  if (!note.remotePath && note.status !== "published") return "";
  const base = String(siteBase || "http://tomfng.space").replace(/\/+$/g, "") || "http://tomfng.space";
  const parts = calendarPartsInTimeZone(note.createdAt || Date.now(), options.timeZone || "Asia/Shanghai");
  if (!parts) return "";
  const slug = encodeURIComponent(String(note.slug || makeSlug(note.title || "note")).trim());
  return `${base}/${parts.year}/${parts.month}/${parts.day}/${slug}/`;
}

function searchNotesWithSnippets(notes, query, options = {}) {
  const terms = String(query || "")
    .toLocaleLowerCase("zh-CN")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
  if (!terms.length) return [];
  const results = [];
  for (const note of Array.from(notes || [])) {
    const title = String(note?.title || "");
    const summary = String(note?.summary || "");
    const content = String(note?.content || "");
    const haystack = [title, summary, content].join("\n");
    const lower = haystack.toLocaleLowerCase("zh-CN");
    if (!terms.every((term) => lower.includes(term))) continue;
    const primary = terms[0];
    const index = lower.indexOf(primary);
    const source = index < title.length
      ? title
      : index < title.length + 1 + summary.length
        ? summary
        : content;
    const localIndex = source.toLocaleLowerCase("zh-CN").indexOf(primary);
    const start = Math.max(0, localIndex - 28);
    const end = Math.min(source.length, localIndex + primary.length + 36);
    let snippet = source.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snippet = `…${snippet}`;
    if (end < source.length) snippet = `${snippet}…`;
    results.push({
      id: note.id,
      title: title || "无标题",
      status: getNoteListStatus(note),
      snippet: snippet || summary || content.slice(0, 80),
      score: terms.reduce((sum, term) => sum + (lower.split(term).length - 1), 0)
    });
  }
  return results.sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), "zh-CN")).slice(0, limit);
}

function wouldCreateParentCycle(notes, noteId, parentId) {
  const id = String(noteId || "").trim();
  let cursor = String(parentId || "").trim();
  if (!id || !cursor) return false;
  if (cursor === id) return true;
  const byId = new Map(Array.from(notes || []).map((note) => [String(note.id), note]));
  const seen = new Set();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = String(byId.get(cursor)?.parentId || "").trim();
  }
  return false;
}

function buildNoteTree(notes, sortBy = "updated") {
  const items = Array.from(notes || []).map((note) => normalizeNote(note));
  const byId = new Map(items.map((note) => [note.id, { ...note, children: [] }]));
  const roots = [];
  byId.forEach((node) => {
    const parent = node.parentId && byId.get(node.parentId);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (nodes) => {
    const ordered = sortNotes(nodes, sortBy);
    nodes.length = 0;
    nodes.push(...ordered);
    nodes.forEach((node) => sortNodes(node.children || []));
  };
  sortNodes(roots);
  return roots;
}

function flattenNoteTree(nodes, depth = 0, output = []) {
  for (const node of Array.from(nodes || [])) {
    output.push({ note: node, depth });
    flattenNoteTree(node.children || [], depth + 1, output);
  }
  return output;
}

function orderNotesWithPinsAndTree(notes, library = {}, sortBy = "updated") {
  const sorted = sortNotes(notes, sortBy);
  const pinned = new Set(normalizeLibraryState(library).pinnedIds);
  const pinnedNotes = sorted.filter((note) => pinned.has(note.id));
  const rest = sorted.filter((note) => !pinned.has(note.id));
  const tree = buildNoteTree(rest, sortBy);
  const flat = flattenNoteTree(tree);
  // Keep pinned at top (flat), then tree-ordered rest.
  const restOrdered = flat.map((item) => item.note);
  const depthById = new Map(flat.map((item) => [item.note.id, item.depth]));
  return {
    notes: [...pinnedNotes, ...restOrdered],
    depthById
  };
}

function filterNotesByListStatus(notes, statusFilter = "all") {
  const values = Array.from(notes || []);
  const filter = String(statusFilter || "all");
  if (filter === "all") return values;
  if (!["draft", "published", "dirty"].includes(filter)) return values;
  return values.filter((note) => getNoteListStatus(note) === filter);
}

function filterNotesByTag(notes, tag = "all") {
  const values = Array.from(notes || []);
  const target = String(tag || "all").trim();
  if (!target || target === "all") return values;
  return values.filter((note) => normalizeTags(note?.tags).includes(target));
}

function sortNotes(notes, sortBy = "updated") {
  const values = Array.from(notes || []);
  const mode = String(sortBy || "updated");
  const ranked = values.map((note, index) => ({ note, index }));
  ranked.sort((a, b) => {
    if (mode === "title") {
      const cmp = String(a.note?.title || "").localeCompare(String(b.note?.title || ""), "zh-CN");
      return cmp || a.index - b.index;
    }
    const key = mode === "created" ? "createdAt" : "updatedAt";
    const left = new Date(a.note?.[key] || 0).getTime();
    const right = new Date(b.note?.[key] || 0).getTime();
    if (right !== left) return right - left;
    return a.index - b.index;
  });
  return ranked.map((item) => item.note);
}

function selectVisibleNotes(notes, options = {}) {
  const source = Array.from(notes || []);
  const category = options.category == null ? "all" : options.category;
  const byCategory = category === "all"
    ? source
    : source.filter((note) => normalizeCategory(note?.category) === normalizeCategory(category));
  const byStatus = filterNotesByListStatus(byCategory, options.statusFilter || "all");
  const byTag = filterNotesByTag(byStatus, options.tag || "all");
  const byQuery = filterNotesByQuery(byTag, options.query || "");
  if (options.library || options.tree) {
    return orderNotesWithPinsAndTree(byQuery, options.library || {}, options.sortBy || "updated").notes;
  }
  return sortNotes(byQuery, options.sortBy || "updated");
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

function findMarkdownFootnoteDefinition(lines, label) {
  const target = String(label || "").trim();
  if (!target) return null;
  const values = Array.from(lines || [], (line) => String(line || ""));
  const pattern = new RegExp(`^\\[\\^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]:\\s*`);
  for (let line = 0; line < values.length; line += 1) {
    if (pattern.test(values[line])) {
      return { line, ch: values[line].indexOf("]:") + 2 };
    }
  }
  return null;
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
    if (selection) {
      const body = `\`\`\`\n${selection}\n\`\`\``;
      const start = body.indexOf("\n") + 1;
      return { body, selectionStart: start, selectionEnd: start + selection.length };
    }
    const body = "```\n\n```";
    // Cursor after the opening fence so the language tag can be typed first.
    return { body, selectionStart: 3, selectionEnd: 3 };
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
  buildNoteTree,
  calendarPartsInTimeZone,
  createHtmlToMarkdown,
  escapeHtml,
  extractMarkdownHeadings,
  extractNoteCover,
  isSafeCoverUrl,
  filterNotesByListStatus,
  filterNotesByQuery,
  filterNotesByTag,
  findMarkdownFootnoteDefinition,
  findMarkdownImageAt,
  findMarkdownLinkAt,
  flattenNoteTree,
  formatMarkdownImage,
  formatMarkdownImageSize,
  formatMarkdownLink,
  formatDate,
  formatRelativeTime,
  getMarkdownTableContext,
  getNoteListStatus,
  isRemoteDraftPath,
  lineHasGfmHardBreak,
  makeId,
  makeSlug,
  markdownToHtml,
  markdownBlockTemplate,
  markdownEmptyBlockEnterEdit,
  markdownFootnoteTemplate,
  markdownListBackspaceEdit,
  markdownListJoinBackspaceEdit,
  markdownPairBackspaceEdit,
  markdownPairInputEdit,
  markdownSoftBreakInsert,
  markdownTableKeyboardEdit,
  editMarkdownTable,
  normalizeLibraryState,
  orderNotesWithPinsAndTree,
  parseMarkdownImageSize,
  publicNoteUrl,
  renumberMarkdownOrderedList,
  mergeRemotePosts,
  noteContentFingerprint,
  normalizeCategory,
  normalizeEditorViewState,
  normalizeMarkdownImageUrl,
  normalizeMarkdownLinkUrl,
  normalizeNote,
  normalizeNotesData,
  normalizeTags,
  parseMarkdownSlashContext,
  searchNotesWithSnippets,
  selectVisibleNotes,
  sortNotes,
  stripMarkdownBlockPrefix,
  toggleIdInList,
  toggleMarkdownTask,
  touchRecent,
  transformMarkdownBlockLines,
  wouldCreateParentCycle
};
}());
