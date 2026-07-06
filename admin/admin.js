(function () {
const root = document.querySelector("[data-notes-admin]");
const tools = window.TomfngNoteTools;
if (!root || root.dataset.ready === "true" || !tools) return;
root.dataset.ready = "true";

const {
  escapeHtml,
  formatDate,
  makeId,
  makeSlug,
  markdownToHtml,
  normalizeCategory,
  normalizeNote,
  normalizeNotesData,
  normalizeTags
} = tools;

const DATA_URL = "/notes-data.json";
const STORAGE_KEY = "tomfng-notes-workspace";
const CONFIG_KEY = "tomfng-notes-github-config";
const EDITOR_MODE_KEY = "tomfng-notes-editor-mode";
const OWNER_LOGIN = "Nike232";
const AUTH_USER_URL = "https://api.github.com/user";
const DEFAULT_POST_DIR = "source/_posts";
const REMOTE_NOTES_PATHS = ["source/notes-data.json", "notes-data.json"];
const DEFAULT_CONFIG = {
  owner: "Nike232",
  repo: "Nike232.github.io",
  branch: "main",
  path: DEFAULT_POST_DIR,
  token: ""
};

const state = {
  data: normalizeNotesData({ notes: [] }),
  selectedId: null,
  dirty: false,
  remoteSha: null,
  config: loadConfig(),
  workspaceStarted: false,
  authUser: null,
  busy: false,
  category: "all",
  editor: null,
  editorMode: localStorage.getItem(EDITOR_MODE_KEY) === "vim" ? "vim" : "default",
  vimCursorMode: "normal",
  vimBlockCursor: null,
  typingPulse: null,
  typingTimer: null,
  syncingEditor: false
};

const fields = {
  title: root.querySelector("#field-title"),
  slug: root.querySelector("#field-slug"),
  category: root.querySelector("#field-category"),
  tags: root.querySelector("#field-tags"),
  status: root.querySelector("#field-status"),
  summary: root.querySelector("#field-summary"),
  content: root.querySelector("#field-content")
};

const elements = {
  authPanel: root.querySelector("[data-admin-auth-panel]"),
  adminWorkspaces: [...root.querySelectorAll("[data-admin-workspace]")],
  authToken: root.querySelector("#auth-token"),
  authUnlock: root.querySelector("#auth-unlock"),
  authClear: root.querySelector("#auth-clear"),
  authMessage: root.querySelector("#auth-message"),
  count: root.querySelector("#admin-count"),
  categoryStrip: root.querySelector("#admin-category-strip"),
  categoryOptions: root.querySelector("#category-options"),
  list: root.querySelector("#admin-list"),
  form: root.querySelector("#editor-form"),
  status: root.querySelector("#status-text"),
  dirty: root.querySelector("#dirty-state"),
  previewTitle: root.querySelector("#preview-title"),
  previewSummary: root.querySelector("#preview-summary"),
  previewContent: root.querySelector("#preview-content"),
  errorTitle: root.querySelector("#error-title"),
  errorSlug: root.querySelector("#error-slug"),
  newNote: root.querySelector("#new-note"),
  duplicateNote: root.querySelector("#duplicate-note"),
  deleteNote: root.querySelector("#delete-note"),
  saveLocal: root.querySelector("#save-local"),
  pullRemote: root.querySelector("#pull-remote"),
  publishRemote: root.querySelector("#publish-remote"),
  saveConfig: root.querySelector("#save-config"),
  toggleVim: root.querySelector("#toggle-vim"),
  editorMode: root.querySelector("#editor-mode"),
  editorPosition: root.querySelector("#editor-position"),
  editorWords: root.querySelector("#editor-words"),
  configToken: root.querySelector("#config-token"),
  configOwner: root.querySelector("#config-owner"),
  configRepo: root.querySelector("#config-repo"),
  configBranch: root.querySelector("#config-branch"),
  configPath: root.querySelector("#config-path")
};

init();

async function init() {
  bindAuthEvents();
  hydrateConfigForm();
  if (state.config.token) {
    elements.authToken.value = state.config.token;
    await unlockAdmin(state.config.token, { auto: true });
    return;
  }
  renderAuthState("locked", "未验证时不会加载笔记编辑器。");
}

async function startWorkspace() {
  if (state.workspaceStarted) return;
  state.workspaceStarted = true;
  bindWorkspaceEvents();
  initMarkdownEditor();
  const localData = loadWorkspace();
  if (localData) {
    state.data = normalizeNotesData(localData);
    state.selectedId = state.data.notes[0]?.id || null;
    setStatus("已载入本地草稿");
    render();
    return;
  }
  await loadPublicData();
}

function bindAuthEvents() {
  elements.authUnlock.addEventListener("click", () => unlockAdmin(elements.authToken.value));
  elements.authToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      unlockAdmin(elements.authToken.value);
    }
  });
  elements.authClear.addEventListener("click", clearAdminCredentials);
}

function bindWorkspaceEvents() {
  elements.newNote.addEventListener("click", createNote);
  elements.duplicateNote.addEventListener("click", duplicateSelectedNote);
  elements.deleteNote.addEventListener("click", deleteSelectedNote);
  elements.saveLocal.addEventListener("click", saveWorkspace);
  elements.pullRemote.addEventListener("click", pullRemote);
  elements.publishRemote.addEventListener("click", publishRemote);
  elements.saveConfig.addEventListener("click", saveConfig);
  elements.toggleVim.addEventListener("click", toggleEditorMode);
  Object.values(fields).forEach((field) => field.addEventListener("input", updateSelectedFromFields));
  fields.status.addEventListener("change", updateSelectedFromFields);
  elements.form.addEventListener("submit", (event) => event.preventDefault());
}

async function unlockAdmin(rawToken, options = {}) {
  const token = String(rawToken || "").trim();
  if (!token) {
    renderAuthState("locked", "需要 GitHub Token 才能进入管理区。", true);
    return;
  }
  renderAuthState("checking", options.auto ? "正在验证本机凭据..." : "正在验证 GitHub 身份...");
  try {
    const user = await verifyOwnerToken(token);
    state.authUser = user.login;
    state.config = normalizeConfig({
      ...state.config,
      token,
      owner: elements.configOwner.value.trim() || state.config.owner,
      repo: elements.configRepo.value.trim() || state.config.repo,
      branch: elements.configBranch.value.trim() || state.config.branch,
      path: normalizePostDirectory(elements.configPath.value.trim() || state.config.path)
    });
    persistConfig();
    hydrateConfigForm();
    renderAuthState("unlocked", `已验证为 ${user.login}`);
    await startWorkspace();
  } catch (error) {
    state.authUser = null;
    state.config = normalizeConfig({ ...state.config, token: "" });
    persistConfig();
    hydrateConfigForm();
    elements.authToken.value = "";
    renderAuthState("locked", `验证失败：${error.message}`, true);
  }
}

async function verifyOwnerToken(token) {
  const user = await githubFetchWithToken(AUTH_USER_URL, token);
  const login = String(user.login || "");
  if (login.toLowerCase() !== OWNER_LOGIN.toLowerCase()) {
    throw new Error(`当前账号是 ${login || "未知账号"}，不是 ${OWNER_LOGIN}`);
  }
  return user;
}

function renderAuthState(nextState, message, isError = false) {
  root.dataset.authState = nextState;
  const unlocked = nextState === "unlocked";
  elements.authPanel.hidden = unlocked;
  elements.adminWorkspaces.forEach((element) => {
    element.hidden = !unlocked;
  });
  elements.authUnlock.disabled = nextState === "checking";
  elements.authClear.disabled = nextState === "checking";
  if (message) {
    elements.authMessage.textContent = message;
    elements.authMessage.style.color = isError ? "var(--note-red)" : "var(--note-muted)";
  }
}

function clearAdminCredentials() {
  state.authUser = null;
  state.config = normalizeConfig({ ...state.config, token: "" });
  persistConfig();
  localStorage.removeItem(EDITOR_MODE_KEY);
  elements.authToken.value = "";
  hydrateConfigForm();
  renderAuthState("locked", "已清除当前浏览器里的管理凭据。");
  if (state.workspaceStarted) {
    window.location.reload();
  }
}

function hasOwnerAccess() {
  return root.dataset.authState === "unlocked" && state.authUser?.toLowerCase() === OWNER_LOGIN.toLowerCase();
}

function requireOwnerAccess() {
  if (hasOwnerAccess()) return true;
  renderAuthState("locked", "先验证 GitHub 身份，再进入管理区。", true);
  return false;
}

function initMarkdownEditor() {
  if (!window.CodeMirror) {
    fields.content.classList.add("is-fallback-editor");
    updateEditorStats();
    return;
  }

  const useHyperMD = Boolean(window.HyperMD && typeof window.HyperMD.fromTextArea === "function");
  const requestedKeyMap = state.editorMode === "vim" && window.CodeMirror.keyMap.vim ? "vim" : "default";
  if (requestedKeyMap !== "vim") {
    state.editorMode = "default";
  }
  const defaultKeyMap = useHyperMD && window.CodeMirror.keyMap.hypermd ? "hypermd" : "default";
  const enterCommand = window.CodeMirror.commands.hmdNewlineAndContinue
    ? "hmdNewlineAndContinue"
    : "newlineAndIndentContinueMarkdownList";
  const shiftEnterCommand = window.CodeMirror.commands.hmdNewline
    ? "hmdNewline"
    : enterCommand;
  const tabCommand = window.CodeMirror.commands.hmdTab ? "hmdTab" : null;
  const shiftTabCommand = window.CodeMirror.commands.hmdShiftTab ? "hmdShiftTab" : "indentLess";

  const editorOptions = {
    mode: useHyperMD ? "text/x-hypermd" : {
      name: "markdown",
      highlightFormatting: true,
      taskLists: true,
      strikethrough: true
    },
    theme: useHyperMD ? "hypermd-light" : "default",
    keyMap: requestedKeyMap === "vim" ? "vim" : defaultKeyMap,
    lineWrapping: true,
    lineNumbers: false,
    styleActiveLine: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    cursorHeight: 0.82,
    cursorBlinkRate: 600,
    viewportMargin: 40,
    placeholder: fields.content.getAttribute("placeholder") || "",
    foldGutter: false,
    gutters: [],
    hmdFoldMath: false,
    hmdModeLoader: false,
    extraKeys: {
      Enter: enterCommand,
      "Shift-Enter": shiftEnterCommand,
      Tab(cm) {
        if (tabCommand) {
          window.CodeMirror.commands[tabCommand](cm);
          return;
        }
        cm.replaceSelection("  ", "end");
      },
      "Shift-Tab": shiftTabCommand,
      "Ctrl-S"(cm) {
        cm.save();
        saveWorkspace();
      },
      "Cmd-S"(cm) {
        cm.save();
        saveWorkspace();
      }
    }
  };

  state.editor = useHyperMD
    ? window.HyperMD.fromTextArea(fields.content, editorOptions)
    : window.CodeMirror.fromTextArea(fields.content, editorOptions);

  state.editor.on("change", (_cm, change) => {
    if (state.syncingEditor) return;
    fields.content.value = state.editor.getValue();
    updateSelectedFromFields();
    updateEditorStats();
    triggerTypingPulse(change);
  });
  state.editor.on("cursorActivity", () => {
    updateEditorStats();
    syncEditorCursorStyle();
  });
  state.editor.on("focus", () => setEditorFocusState(true));
  state.editor.on("blur", () => setEditorFocusState(false));
  state.editor.on("vim-mode-change", (_cm, event) => {
    state.vimCursorMode = event?.mode || "normal";
    syncEditorCursorStyle();
  });
  state.editor.on("scroll", syncEditorCursorStyle);
  syncEditorCursorStyle();
  setEditorFocusState(state.editor.hasFocus?.());
  updateEditorStats();
}

function getEditorField() {
  return state.editor?.getWrapperElement?.()?.closest(".editor-field") || null;
}

function setEditorFocusState(focused) {
  const field = getEditorField();
  if (!field) return;
  field.classList.toggle("is-editor-focused", Boolean(focused));
  if (!focused) {
    field.classList.remove("is-editor-typing");
  }
}

function syncEditorCursorStyle() {
  if (!state.editor || !window.CodeMirror) return;
  const wrapper = state.editor.getWrapperElement?.();
  if (!wrapper) return;

  if (state.editorMode !== "vim") {
    window.CodeMirror.rmClass(wrapper, "note-vim-thin-cursor");
    window.CodeMirror.rmClass(wrapper, "note-vim-block-cursor");
    setVimBlockCursorVisible(false);
    return;
  }

  state.editor.options.$customCursor = null;
  window.CodeMirror.rmClass(wrapper, "cm-fat-cursor");
  if (state.editor.getOption("showCursorWhenSelecting") !== true) {
    state.editor.setOption("showCursorWhenSelecting", true);
  }

  const vim = state.editor.state?.vim;
  const isInsertLike = vim?.insertMode || state.vimCursorMode === "insert" || state.vimCursorMode === "replace";
  window.CodeMirror.rmClass(wrapper, isInsertLike ? "note-vim-block-cursor" : "note-vim-thin-cursor");
  window.CodeMirror.addClass(wrapper, isInsertLike ? "note-vim-thin-cursor" : "note-vim-block-cursor");

  if (isInsertLike) {
    setVimBlockCursorVisible(false);
    return;
  }

  window.requestAnimationFrame?.(positionVimBlockCursor);
}

function ensureVimBlockCursor() {
  if (state.vimBlockCursor?.isConnected) return state.vimBlockCursor;
  const wrapper = state.editor?.getWrapperElement?.();
  if (!wrapper) return null;
  const marker = document.createElement("span");
  marker.className = "note-vim-block-cursor-marker";
  marker.setAttribute("aria-hidden", "true");
  wrapper.appendChild(marker);
  state.vimBlockCursor = marker;
  return marker;
}

function setVimBlockCursorVisible(visible) {
  const marker = state.vimBlockCursor || ensureVimBlockCursor();
  if (!marker) return;
  marker.hidden = !visible;
}

function shouldShowTypingPulse(change) {
  if (!state.editor?.hasFocus?.() || change?.origin === "setValue") return false;
  if (state.editorMode !== "vim") return true;
  const vim = state.editor.state?.vim;
  return Boolean(vim?.insertMode || state.vimCursorMode === "insert" || state.vimCursorMode === "replace");
}

function ensureTypingPulse() {
  if (state.typingPulse?.isConnected) return state.typingPulse;
  const wrapper = state.editor?.getWrapperElement?.();
  if (!wrapper) return null;
  const pulse = document.createElement("span");
  pulse.className = "note-typing-pulse";
  pulse.setAttribute("aria-hidden", "true");
  wrapper.appendChild(pulse);
  state.typingPulse = pulse;
  return pulse;
}

function triggerTypingPulse(change) {
  if (!shouldShowTypingPulse(change)) return;
  window.requestAnimationFrame?.(() => {
    const pulse = ensureTypingPulse();
    const wrapper = state.editor?.getWrapperElement?.();
    const cursor = wrapper?.querySelector(".CodeMirror-cursor");
    if (!pulse || !wrapper || !cursor) return;

    const cursorRect = cursor.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    pulse.style.left = `${cursorRect.left - wrapperRect.left}px`;
    pulse.style.top = `${cursorRect.top - wrapperRect.top}px`;
    pulse.style.height = `${cursorRect.height}px`;
    pulse.classList.remove("is-active");
    void pulse.offsetWidth;
    pulse.classList.add("is-active");

    const field = getEditorField();
    if (field) {
      field.classList.add("is-editor-typing");
      window.clearTimeout(state.typingTimer);
      state.typingTimer = window.setTimeout(() => {
        field.classList.remove("is-editor-typing");
      }, 720);
    }
  });
}

function positionVimBlockCursor() {
  if (!state.editor || state.editorMode !== "vim") return;
  const wrapper = state.editor.getWrapperElement?.();
  const marker = ensureVimBlockCursor();
  if (!wrapper || !marker || !wrapper.classList.contains("note-vim-block-cursor")) return;

  const target = getRenderedVimCharTarget() || getMeasuredVimCharTarget();
  const charRect = target?.rect;
  const wrapperRect = wrapper.getBoundingClientRect();
  if (!charRect || !charRect.height || !charRect.width) {
    setVimBlockCursorVisible(false);
    return;
  }

  marker.textContent = target.text === " " ? "" : target.text || "";
  syncVimCursorTypography(marker, target.element, charRect);
  marker.style.left = `${charRect.left - wrapperRect.left}px`;
  marker.style.top = `${charRect.top - wrapperRect.top}px`;
  marker.style.width = `${charRect.width}px`;
  marker.style.height = `${charRect.height}px`;
  marker.hidden = false;
}

function syncVimCursorTypography(marker, sourceElement, charRect) {
  const fallback = state.editor?.getWrapperElement?.();
  const style = getComputedStyle(sourceElement || fallback);
  marker.style.fontFamily = style.fontFamily;
  marker.style.fontSize = style.fontSize;
  marker.style.fontStyle = style.fontStyle;
  marker.style.fontWeight = style.fontWeight;
  marker.style.letterSpacing = style.letterSpacing;
  marker.style.textTransform = style.textTransform;
  marker.style.lineHeight = `${charRect.height}px`;
}

function getRenderedVimCharTarget() {
  const position = state.editor.getCursor();
  const line = state.editor.getLine(position.line) || "";
  if (!line.length) return null;

  const lineNode = getRenderedLineNode(position.line);
  if (!lineNode) return null;

  const startIndex = Math.min(position.ch, line.length - 1);
  for (const charIndex of nearbyIndexes(startIndex, line.length)) {
    const target = getTextRangeTarget(lineNode, charIndex);
    if (target && isUsableVimRect(target.rect)) return target;
  }
  return null;
}

function getMeasuredVimCharTarget() {
  const position = state.editor.getCursor();
  const line = state.editor.getLine(position.line) || "";
  const ch = Math.min(position.ch, Math.max(line.length - 1, 0));
  const from = state.editor.charCoords({ line: position.line, ch }, "window");
  const to = state.editor.charCoords({ line: position.line, ch: ch + 1 }, "window");
  const width = Math.max(7, Math.abs((to.left || to.right) - from.left) || state.editor.defaultCharWidth?.() || 8);
  return {
    rect: {
      left: from.left,
      right: from.left + width,
      top: from.top,
      bottom: from.bottom,
      width,
      height: Math.max(2, from.bottom - from.top)
    },
    text: line[ch] || "",
    element: getRenderedLineNode(position.line) || state.editor.getWrapperElement?.()
  };
}

function getRenderedLineNode(lineNumber) {
  const display = state.editor.display;
  if (!display?.view?.length) return null;

  for (const lineView of display.view) {
    const firstLine = typeof lineView.line?.lineNo === "function" ? lineView.line.lineNo() : null;
    const lineCount = lineView.size || 1;
    if (firstLine === null || lineNumber < firstLine || lineNumber >= firstLine + lineCount) continue;

    if (lineCount === 1) return lineView.text || lineView.node || null;
    const lineNodes = lineView.node
      ? [...lineView.node.querySelectorAll("pre.CodeMirror-line, pre.CodeMirror-line-like")]
      : [];
    return lineNodes[lineNumber - firstLine] || lineView.text || lineView.node || null;
  }
  return null;
}

function nearbyIndexes(startIndex, length) {
  const indexes = [startIndex];
  for (let offset = 1; offset < length; offset += 1) {
    if (startIndex + offset < length) indexes.push(startIndex + offset);
    if (startIndex - offset >= 0) indexes.push(startIndex - offset);
  }
  return indexes;
}

function getTextRangeTarget(root, charIndex) {
  const match = findTextNodeAt(root, charIndex);
  if (!match) return null;

  const range = document.createRange();
  range.setStart(match.node, match.offset);
  range.setEnd(match.node, Math.min(match.offset + 1, match.node.nodeValue.length));
  const rect = [...range.getClientRects()].find(isUsableVimRect) || range.getBoundingClientRect();
  range.detach?.();
  return {
    rect: {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    },
    text: match.node.nodeValue.slice(match.offset, match.offset + 1),
    element: match.node.parentElement || root
  };
}

function findTextNodeAt(root, charIndex) {
  let remaining = charIndex;
  const visit = (node) => {
    if (node.nodeType === 3) {
      const length = node.nodeValue.length;
      if (remaining < length) return { node, offset: remaining };
      remaining -= length;
      return null;
    }
    for (const child of node.childNodes) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  };
  return visit(root);
}

function isUsableVimRect(rect) {
  return Boolean(rect && rect.width >= 2 && rect.height >= 8);
}

async function loadPublicData() {
  setBusy(true);
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = normalizeNotesData(await response.json());
    state.selectedId = state.data.notes[0]?.id || null;
    setStatus("已载入公开数据");
  } catch (error) {
    setStatus(`读取失败：${error.message}`, true);
  } finally {
    setBusy(false);
    render();
  }
}

function createNote() {
  if (!requireOwnerAccess()) return;
  const now = new Date().toISOString();
  const note = normalizeNote({
    id: makeId(),
    title: "无标题",
    slug: `note-${Date.now().toString(36)}`,
    category: state.category === "all" ? "未分类" : state.category,
    tags: [],
    status: "draft",
    summary: "",
    content: "",
    createdAt: now,
    updatedAt: now
  });
  state.data.notes.unshift(note);
  state.selectedId = note.id;
  markDirty("新建页面");
  render();
}

function duplicateSelectedNote() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note) return;
  const now = new Date().toISOString();
  const copy = normalizeNote({
    ...note,
    id: makeId(),
    title: `${note.title} 副本`,
    slug: `${note.slug || makeSlug(note.title)}-copy`,
    status: "draft",
    createdAt: now,
    updatedAt: now
  });
  state.data.notes.unshift(copy);
  state.selectedId = copy.id;
  markDirty("已复制到本地");
  render();
}

function deleteSelectedNote() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note) return;
  state.data.notes = state.data.notes.filter((item) => item.id !== note.id);
  state.selectedId = state.data.notes[0]?.id || null;
  markDirty("已在本地删除");
  render();
}

function updateSelectedFromFields() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note) return;
  note.title = fields.title.value.trimStart();
  note.category = normalizeCategory(fields.category.value);
  note.tags = normalizeTags(fields.tags.value);
  note.status = fields.status.value;
  note.slug = note.status === "published"
    ? ensureNoteSlug({ ...note, slug: fields.slug.value.trim() })
    : autoSlugForTitle(note.title);
  fields.slug.value = note.slug;
  note.summary = fields.summary.value.trimStart();
  note.content = getEditorValue();
  note.updatedAt = new Date().toISOString();
  if (state.category !== "all" && state.category !== note.category) {
    state.category = note.category;
  }
  markDirty("正在编辑");
  renderCategories();
  renderList();
  renderPreview(note);
  validateSelected();
  updateEditorStats();
}

function render() {
  renderCategories();
  renderList();
  renderEditor();
  renderDirtyState();
  updateEditorStats();
}

function getCategories() {
  return [...new Set(state.data.notes.map((note) => normalizeCategory(note.category)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getVisibleNotes() {
  if (state.category === "all") return state.data.notes;
  return state.data.notes.filter((note) => normalizeCategory(note.category) === state.category);
}

function renderCategories() {
  const categories = getCategories();
  if (state.category !== "all" && !categories.includes(state.category)) {
    state.category = "all";
  }
  const buttons = ["all", ...categories].map((category) => {
    const label = category === "all" ? "全部" : category;
    const active = category === state.category ? " is-active" : "";
    return `<button class="category-filter${active}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`;
  });
  elements.categoryStrip.innerHTML = buttons.join("");
  elements.categoryOptions.innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
  elements.categoryStrip.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      const visible = getVisibleNotes();
      if (!visible.some((note) => note.id === state.selectedId)) {
        state.selectedId = visible[0]?.id || null;
      }
      render();
    });
  });
}

function renderList() {
  const visibleNotes = getVisibleNotes();
  elements.count.textContent = `${visibleNotes.length}`;
  if (!visibleNotes.length) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>${state.data.notes.length ? "这个分类是空的" : "没有页面"}</h2>
        <p>${state.data.notes.length ? "新建页面会自动放进当前分类。" : "点击新建，开始写第一条笔记。"}</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = visibleNotes.map((note) => {
    const active = note.id === state.selectedId ? " is-active" : "";
    return `
      <button class="note-row${active}" type="button" data-id="${escapeHtml(note.id)}">
        <span class="note-row-title">
          <span>${escapeHtml(note.title || "无标题")}</span>
          <span class="state-pill state-${escapeHtml(note.status)}">${escapeHtml(note.status)}</span>
        </span>
        <span class="note-row-meta">${escapeHtml(normalizeCategory(note.category))} / ${formatDate(note.updatedAt)}</span>
        <span class="note-row-summary">${escapeHtml(note.summary || note.content.slice(0, 110) || "无摘要")}</span>
      </button>
    `;
  }).join("");

  elements.list.querySelectorAll(".note-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedId = row.dataset.id;
      render();
    });
  });
}

function renderEditor() {
  const note = getSelectedNote();
  const disabled = !note;
  Object.values(fields).forEach((field) => {
    field.disabled = disabled;
  });
  elements.duplicateNote.disabled = disabled;
  elements.deleteNote.disabled = disabled;

  if (!note) {
    fields.title.value = "";
    fields.slug.value = "";
    fields.category.value = "";
    fields.tags.value = "";
    fields.status.value = "draft";
    fields.summary.value = "";
    setEditorValue("");
    setEditorEnabled(false);
    elements.previewTitle.textContent = "未选择页面";
    elements.previewSummary.textContent = "";
    elements.previewContent.innerHTML = `
      <div class="empty-state">
        <h2>空白工作区</h2>
        <p>从左侧新建或选择一条笔记。</p>
      </div>
    `;
    return;
  }

  fields.title.value = note.title;
  fields.slug.value = syncDraftSlug(note);
  fields.category.value = normalizeCategory(note.category);
  fields.tags.value = note.tags.join(", ");
  fields.status.value = note.status;
  fields.summary.value = note.summary;
  setEditorValue(note.content);
  setEditorEnabled(true);
  renderPreview(note);
  validateSelected();
}

function renderPreview(note) {
  elements.previewTitle.textContent = note.title || "无标题";
  elements.previewSummary.textContent = note.summary || "";
  elements.previewContent.innerHTML = markdownToHtml(contentWithoutTitleHeading(note) || " ");
}

function getEditorValue() {
  return state.editor ? state.editor.getValue() : fields.content.value;
}

function setEditorValue(value) {
  const nextValue = String(value || "");
  fields.content.value = nextValue;
  if (!state.editor) return;
  if (state.editor.getValue() === nextValue) {
    updateEditorStats();
    return;
  }
  state.syncingEditor = true;
  state.editor.setValue(nextValue);
  state.editor.clearHistory();
  state.syncingEditor = false;
  updateEditorStats();
}

function setEditorEnabled(enabled) {
  if (!state.editor) return;
  state.editor.setOption("readOnly", enabled ? false : "nocursor");
}

function toggleEditorMode() {
  if (!requireOwnerAccess()) return;
  state.editorMode = state.editorMode === "vim" ? "default" : "vim";
  if (state.editorMode === "vim" && (!window.CodeMirror || !window.CodeMirror.keyMap.vim)) {
    state.editorMode = "default";
    setStatus("Vim 模式未加载", true);
  }
  localStorage.setItem(EDITOR_MODE_KEY, state.editorMode);
  if (state.editor) {
    const defaultKeyMap = window.CodeMirror?.keyMap?.hypermd ? "hypermd" : "default";
    state.editor.setOption("keyMap", state.editorMode === "vim" ? "vim" : defaultKeyMap);
    syncEditorCursorStyle();
    window.requestAnimationFrame?.(syncEditorCursorStyle);
    state.editor.focus();
  }
  updateEditorStats();
}

function updateEditorStats() {
  const value = getEditorValue();
  const cursor = state.editor ? state.editor.getCursor() : textareaCursor(fields.content);
  const charCount = value.replace(/\s/g, "").length;
  elements.editorMode.textContent = state.editorMode === "vim" ? "Vim" : "所见";
  elements.editorPosition.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
  elements.editorWords.textContent = `${charCount} 字`;
  elements.toggleVim.classList.toggle("is-active", state.editorMode === "vim");
  elements.toggleVim.setAttribute("aria-pressed", state.editorMode === "vim" ? "true" : "false");
}

function textareaCursor(textarea) {
  const value = textarea.value.slice(0, textarea.selectionStart || 0);
  const lines = value.split("\n");
  return {
    line: Math.max(lines.length - 1, 0),
    ch: lines[lines.length - 1]?.length || 0
  };
}

function contentWithoutTitleHeading(note) {
  const title = String(note.title || "").trim();
  if (!title) return note.content || "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(note.content || "").replace(new RegExp(`^#\\s+${escaped}\\s*(\\n|$)`, "i"), "").trimStart();
}

function renderDirtyState() {
  elements.dirty.textContent = state.dirty ? "dirty" : "clean";
}

function validateSelected() {
  const note = getSelectedNote();
  if (!note) return false;
  let valid = true;
  elements.errorTitle.textContent = "";
  elements.errorSlug.textContent = "";
  if (!note.title.trim()) {
    elements.errorTitle.textContent = "需要标题";
    valid = false;
  }
  ensureNoteSlug(note);
  return valid;
}

function getSelectedNote() {
  return state.data.notes.find((note) => note.id === state.selectedId) || null;
}

function markDirty(message) {
  state.dirty = true;
  setStatus(message);
  persistWorkspace(false);
  renderDirtyState();
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--note-red)" : "var(--note-muted)";
}

function setBusy(value) {
  state.busy = value;
  [elements.pullRemote, elements.publishRemote, elements.saveLocal, elements.saveConfig].forEach((button) => {
    button.disabled = value;
  });
}

function saveWorkspace() {
  if (!requireOwnerAccess()) return;
  persistWorkspace(true);
}

function persistWorkspace(report) {
  const payload = serializeData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (report) {
    state.dirty = false;
    setStatus("已保存到本地");
    renderDirtyState();
  }
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function serializeData() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: state.data.notes.map((note) => normalizeNote(note))
  };
}

function hydrateConfigForm() {
  elements.configToken.value = state.config.token || "";
  elements.configOwner.value = state.config.owner;
  elements.configRepo.value = state.config.repo;
  elements.configBranch.value = state.config.branch;
  elements.configPath.value = state.config.path;
}

function saveConfig() {
  if (!requireOwnerAccess()) return;
  state.config = {
    token: elements.configToken.value.trim(),
    owner: elements.configOwner.value.trim() || DEFAULT_CONFIG.owner,
    repo: elements.configRepo.value.trim() || DEFAULT_CONFIG.repo,
    branch: elements.configBranch.value.trim() || DEFAULT_CONFIG.branch,
    path: normalizePostDirectory(elements.configPath.value.trim() || DEFAULT_CONFIG.path)
  };
  persistConfig();
  setStatus("GitHub 配置已保存");
}

function persistConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return normalizeConfig({ ...DEFAULT_CONFIG, ...(raw ? JSON.parse(raw) : {}) });
  } catch {
    return normalizeConfig({ ...DEFAULT_CONFIG });
  }
}

function normalizeConfig(config) {
  const next = { ...DEFAULT_CONFIG, ...(config || {}) };
  next.path = normalizePostDirectory(next.path);
  return next;
}

async function pullRemote() {
  if (!requireOwnerAccess()) return;
  saveConfig();
  if (!state.config.token) {
    setStatus("需要 GitHub Token", true);
    return;
  }
  setBusy(true);
  try {
    const remote = await getRemoteNotesData();
    state.remoteSha = remote.sha;
    state.data = normalizeNotesData(remote.data);
    state.selectedId = state.data.notes[0]?.id || null;
    state.dirty = false;
    persistWorkspace(false);
    setStatus(`已拉取笔记库：${remote.path}`);
    render();
  } catch (error) {
    setStatus(`拉取失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function publishRemote() {
  if (!requireOwnerAccess()) return;
  saveConfig();
  if (!state.config.token) {
    setStatus("需要 GitHub Token", true);
    return;
  }
  const note = getSelectedNote();
  if (!note) {
    setStatus("先选择一篇文章", true);
    return;
  }
  fields.slug.value = syncDraftSlug(note);
  if (!validateSelected()) return;

  setBusy(true);
  try {
    const publishedNote = normalizeNote({
      ...note,
      status: "published",
      updatedAt: new Date().toISOString()
    });
    const postPath = postFilePath(publishedNote);
    let sha = null;
    try {
      const remote = await getRemoteFile(postPath);
      sha = remote.sha;
    } catch (error) {
      if (!String(error.message).includes("404")) throw error;
    }

    if (!(await branchLooksLikeHexoSource())) {
      throw new Error(`目标分支 ${state.config.branch} 缺少 _config.yml，请选择 Hexo 源码分支后发布`);
    }
    await putRemoteFile(
      postPath,
      buildHexoPost(publishedNote),
      `${sha ? "Update" : "Publish"} post: ${publishedNote.title}`,
      sha
    );
    Object.assign(note, publishedNote);
    state.dirty = false;
    persistWorkspace(false);
    setStatus(`已发布文章：${postPath}`);
    render();
  } catch (error) {
    setStatus(`发布失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function getRemoteNotesData() {
  let lastError = null;
  for (const path of REMOTE_NOTES_PATHS) {
    try {
      const remote = await getRemoteFile(path);
      return {
        path,
        sha: remote.sha,
        data: JSON.parse(decodeBase64(remote.content || ""))
      };
    } catch (error) {
      lastError = error;
      if (!String(error.message).includes("404")) throw error;
    }
  }
  throw lastError || new Error("未找到远程笔记库");
}

async function branchLooksLikeHexoSource() {
  try {
    await getRemoteFile("_config.yml");
    return true;
  } catch {
    return false;
  }
}

async function getRemoteFile(path) {
  return githubFetch(`${fileApiUrl(path)}?ref=${encodeURIComponent(state.config.branch)}`);
}

async function putRemoteFile(path, content, message, sha) {
  const body = {
    message,
    content: encodeBase64(content),
    branch: state.config.branch
  };
  if (sha) body.sha = sha;
  return githubFetch(fileApiUrl(path), {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

function postFilePath(note) {
  const dir = normalizePostDirectory(state.config.path);
  const slug = normalizePostSlug(note.slug || makeSlug(note.title), note.title);
  return dir ? `${dir}/${slug}.md` : `${slug}.md`;
}

function buildHexoPost(note) {
  const category = normalizeCategory(note.category);
  const tags = normalizeTags(note.tags);
  const frontMatter = [
    "---",
    `title: ${yamlScalar(note.title || "无标题")}`,
    `date: ${formatHexoDate(note.createdAt)}`,
    `updated: ${formatHexoDate(note.updatedAt)}`,
    `categories:`,
    `  - ${yamlScalar(category)}`
  ];
  if (tags.length) {
    frontMatter.push("tags:", ...tags.map((tag) => `  - ${yamlScalar(tag)}`));
  }
  if (note.summary) {
    frontMatter.push(`description: ${yamlScalar(note.summary)}`);
  }
  frontMatter.push("---");
  return `${frontMatter.join("\n")}\n\n${postBody(note)}\n`;
}

function postBody(note) {
  return stripFrontMatter(contentWithoutTitleHeading(note)).trim();
}

function stripFrontMatter(markdown) {
  return String(markdown || "").replace(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/, "");
}

function normalizePostDirectory(path) {
  const raw = String(path || DEFAULT_POST_DIR).trim().replace(/\\/g, "/");
  if (!raw || raw === "notes-data.json" || raw === "source/notes-data.json") return DEFAULT_POST_DIR;
  const withoutFile = /\.md$/i.test(raw) ? raw.replace(/\/?[^/]*\.md$/i, "") : raw;
  return withoutFile.replace(/^\/+|\/+$/g, "") || DEFAULT_POST_DIR;
}

function normalizePostSlug(slug, title) {
  const cleaned = String(slug || "")
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[\\/#?%*:|"<>]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || makeSlug(title || "post");
}

function autoSlugForTitle(title) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle || cleanTitle === "无标题") {
    return `post-${Date.now().toString(36)}`;
  }
  return normalizePostSlug(makeSlug(cleanTitle), cleanTitle);
}

function ensureNoteSlug(note) {
  if (!note) return "";
  note.slug = normalizePostSlug(note.slug || autoSlugForTitle(note.title), note.title);
  return note.slug;
}

function syncDraftSlug(note) {
  if (!note) return "";
  if (note.status !== "published" && (!note.slug || isGeneratedPlaceholderSlug(note.slug))) {
    note.slug = autoSlugForTitle(note.title);
  }
  return ensureNoteSlug(note);
}

function isGeneratedPlaceholderSlug(slug) {
  return /^(note|post)-[a-z0-9]+$/i.test(String(slug || "").trim());
}

function yamlScalar(value) {
  return JSON.stringify(String(value || ""));
}

function formatHexoDate(value) {
  const date = new Date(value || Date.now());
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number) => String(number).padStart(2, "0");
  return [
    `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}`,
    `${pad(safeDate.getHours())}:${pad(safeDate.getMinutes())}:${pad(safeDate.getSeconds())}`
  ].join(" ");
}

function fileApiUrl(path) {
  const owner = encodeURIComponent(state.config.owner);
  const repo = encodeURIComponent(state.config.repo);
  const remotePath = String(path || state.config.path).split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${remotePath}`;
}

async function githubFetch(url, options = {}) {
  return githubFetchWithToken(url, state.config.token, options);
}

async function githubFetchWithToken(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${payload.message || response.statusText}`);
  }
  return payload;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
}());
