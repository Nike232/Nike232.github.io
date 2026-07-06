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
const DEFAULT_API_BASE = "https://tomfng-blog-admin.tomfng-space.workers.dev";
const DEFAULT_CONFIG = {
  apiBase: DEFAULT_API_BASE,
  sessionToken: ""
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
  autosaveTimer: null,
  autosaveStatus: "saved",
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
  authApiBase: root.querySelector("#auth-api-base"),
  authLogin: root.querySelector("#auth-login"),
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
  logoutAdmin: root.querySelector("#logout-admin"),
  toggleVim: root.querySelector("#toggle-vim"),
  editorMode: root.querySelector("#editor-mode"),
  editorPosition: root.querySelector("#editor-position"),
  editorWords: root.querySelector("#editor-words"),
  configApiBase: root.querySelector("#config-api-base")
};

init();

async function init() {
  bindAuthEvents();
  captureSessionFromUrl();
  hydrateConfigForm();
  await checkSession();
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
  elements.authLogin.addEventListener("click", startOwnerVerify);
  elements.authApiBase.addEventListener("change", saveApiBaseFromAuth);
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
  elements.logoutAdmin.addEventListener("click", logoutAdmin);
  elements.toggleVim.addEventListener("click", toggleEditorMode);
  Object.values(fields).forEach((field) => field.addEventListener("input", updateSelectedFromFields));
  fields.status.addEventListener("change", updateSelectedFromFields);
  elements.form.addEventListener("submit", (event) => event.preventDefault());
  window.addEventListener("beforeunload", flushAutosave);
}

async function checkSession() {
  renderAuthState("checking", "正在检查登录状态...");
  try {
    const session = await apiFetch("/api/session");
    const login = session.login || "";
    if (!session.authenticated || login.toLowerCase() !== OWNER_LOGIN.toLowerCase()) {
      throw new Error(session.authenticated ? `当前账号是 ${login || "未知账号"}，不是 ${OWNER_LOGIN}` : "未登录");
    }
    state.authUser = login;
    renderAuthState("unlocked", `已登录为 ${login}`);
    await startWorkspace();
  } catch (error) {
    state.authUser = null;
    const params = new URLSearchParams(window.location.search);
    const verifyError = params.get("admin_error");
    renderAuthState("locked", verifyError ? `登录失败：${verifyError}` : "未登录时不会加载笔记编辑器。", Boolean(verifyError));
  }
}

async function startOwnerVerify() {
  saveApiBaseFromAuth();
  renderAuthState("checking", "正在连接发布服务...");
  try {
    await apiFetch("/api/session");
  } catch (error) {
    renderAuthState("locked", serviceMissingMessage(error), true);
    return;
  }
  const returnTo = window.location.origin + window.location.pathname;
  window.location.href = `${apiUrl("/api/owner/start")}?returnTo=${encodeURIComponent(returnTo)}&session=token`;
}

function saveApiBaseFromAuth() {
  state.config = normalizeConfig({ ...state.config, apiBase: elements.authApiBase.value.trim() });
  persistConfig();
  hydrateConfigForm();
}

function renderAuthState(nextState, message, isError = false) {
  root.dataset.authState = nextState;
  const unlocked = nextState === "unlocked";
  elements.authPanel.hidden = unlocked;
  elements.adminWorkspaces.forEach((element) => {
    element.hidden = !unlocked;
  });
  elements.authLogin.disabled = nextState === "checking";
  elements.authClear.disabled = nextState === "checking";
  if (message) {
    elements.authMessage.textContent = message;
    elements.authMessage.style.color = isError ? "var(--note-red)" : "var(--note-muted)";
  }
}

function clearAdminCredentials() {
  state.authUser = null;
  state.config = normalizeConfig({ ...DEFAULT_CONFIG, sessionToken: "" });
  persistConfig();
  localStorage.removeItem(EDITOR_MODE_KEY);
  hydrateConfigForm();
  renderAuthState("locked", "已清除当前浏览器里的管理设置。");
  if (state.workspaceStarted) {
    window.location.reload();
  }
}

function hasOwnerAccess() {
  return root.dataset.authState === "unlocked" && state.authUser?.toLowerCase() === OWNER_LOGIN.toLowerCase();
}

function requireOwnerAccess() {
  if (hasOwnerAccess()) return true;
  renderAuthState("locked", "先完成身份验证，再进入管理区。", true);
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
  const labels = {
    pending: "未保存",
    saving: "保存中",
    saved: "已保存",
    error: "保存失败"
  };
  elements.dirty.textContent = labels[state.autosaveStatus] || (state.dirty ? "未保存" : "已保存");
  elements.dirty.className = `state-pill state-${state.autosaveStatus || (state.dirty ? "pending" : "saved")}`;
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
  state.autosaveStatus = "pending";
  setStatus(message);
  scheduleAutosave();
  renderDirtyState();
}

function scheduleAutosave() {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = window.setTimeout(() => autoSaveWorkspace(), 500);
}

function autoSaveWorkspace({ manual = false, silent = false } = {}) {
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  if (!state.workspaceStarted || !hasOwnerAccess()) return;

  state.autosaveStatus = "saving";
  if (!silent) setStatus(manual ? "正在保存..." : "正在自动保存...");
  renderDirtyState();

  try {
    persistWorkspace(false);
    state.dirty = false;
    state.autosaveStatus = "saved";
    if (!silent) {
      const time = new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date());
      setStatus(`${manual ? "已保存到本地" : "已自动保存"} ${time}`);
    }
  } catch (error) {
    state.dirty = true;
    state.autosaveStatus = "error";
    if (!silent) setStatus(`自动保存失败：${error.message || "浏览器存储不可用"}`, true);
  } finally {
    renderDirtyState();
  }
}

function flushAutosave() {
  if (!state.autosaveTimer) return;
  autoSaveWorkspace({ silent: true });
}

function setStatus(message, isError = false, linkUrl = "") {
  elements.status.replaceChildren(document.createTextNode(message));
  if (linkUrl) {
    const link = document.createElement("a");
    link.href = linkUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "打开文章";
    elements.status.append(" ");
    elements.status.appendChild(link);
  }
  elements.status.style.color = isError ? "var(--note-red)" : "var(--note-muted)";
}

function setBusy(value) {
  state.busy = value;
  [elements.pullRemote, elements.publishRemote, elements.saveLocal, elements.saveConfig, elements.logoutAdmin].forEach((button) => {
    button.disabled = value;
  });
}

function saveWorkspace() {
  if (!requireOwnerAccess()) return;
  autoSaveWorkspace({ manual: true });
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
  elements.authApiBase.value = state.config.apiBase || "";
  elements.configApiBase.value = state.config.apiBase || "";
}

function saveConfig() {
  if (!requireOwnerAccess()) return;
  state.config = {
    ...state.config,
    apiBase: elements.configApiBase.value.trim()
  };
  persistConfig();
  hydrateConfigForm();
  setStatus("发布服务配置已保存");
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
  next.apiBase = normalizeApiBase(next.apiBase || DEFAULT_API_BASE);
  next.sessionToken = String(next.sessionToken || "");
  return next;
}

function normalizeApiBase(value) {
  const raw = String(value || "").trim().replace(/\/+$/g, "");
  if (!raw) return DEFAULT_API_BASE;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(normalized);
    const staleLocalBases = new Set([
      "http://localhost:4001",
      "http://127.0.0.1:4001",
      "http://[::1]:4001",
      "http://tomfng.space",
      "https://tomfng.space",
      "https://tomfngblog.me"
    ]);
    if (staleLocalBases.has(url.origin)) return DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
  return normalized;
}

function apiUrl(path) {
  const cleanPath = String(path || "");
  const normalizedPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${state.config.apiBase || ""}${normalizedPath}`;
}

async function apiFetch(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };
  if (state.config.sessionToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${state.config.sessionToken}`;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text ? text.slice(0, 160) : "发布服务返回了非 JSON 响应" };
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

function captureSessionFromUrl() {
  const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const token = hash.get("admin_session");
  if (!token) return;
  state.config = normalizeConfig({ ...state.config, sessionToken: token });
  persistConfig();
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

function serviceMissingMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("Failed to fetch") || message.includes("<!DOCTYPE") || message.includes("404") || message.includes("非 JSON")) {
    return "发布服务还没接通：请填入 Worker 地址，或把 /api/* 路由到 Worker。";
  }
  return `发布服务连接失败：${message}`;
}

async function logoutAdmin() {
  setBusy(true);
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {
    // Even if the remote session is already gone, clear this browser state.
  } finally {
    state.authUser = null;
    state.config = normalizeConfig({ ...state.config, sessionToken: "" });
    persistConfig();
    setBusy(false);
    renderAuthState("locked", "已退出管理区。");
    window.location.reload();
  }
}

async function pullRemote() {
  if (!requireOwnerAccess()) return;
  saveConfig();
  setBusy(true);
  try {
    const remote = await apiFetch("/api/notes-data");
    state.data = normalizeNotesData(remote.data || { notes: [] });
    state.selectedId = state.data.notes[0]?.id || null;
    state.dirty = false;
    persistWorkspace(false);
    setStatus(`已拉取笔记库：${remote.path || "notes-data.json"}`);
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
    const remote = await apiFetch("/api/publish", {
      method: "POST",
      body: JSON.stringify({ note: publishedNote })
    });
    Object.assign(note, publishedNote);
    state.dirty = false;
    persistWorkspace(false);
    render();
    if (remote.publicUrl) {
      setStatus("已提交发布，正在生成网站...", false, remote.publicUrl);
      const live = await waitForPublishedPage(remote.publicUrl, publishedNote.title);
      setStatus(
        live.ready ? "已上线" : "已提交发布，网站还在生成，稍后刷新就能看到",
        false,
        remote.publicUrl
      );
    } else {
      setStatus(`已发布文章：${remote.path || publishedNote.title}`);
    }
  } catch (error) {
    setStatus(`发布失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function waitForPublishedPage(publicUrl, title) {
  const attempts = 24;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await sleep(attempt === 1 ? 2500 : 5000);
    try {
      const status = await apiFetch(`/api/publish-status?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(title || "")}`);
      if (status.ready) return status;
      setStatus(`已提交发布，正在生成网站... ${attempt}/${attempts}`, false, publicUrl);
    } catch {
      setStatus(`已提交发布，正在等待网站响应... ${attempt}/${attempts}`, false, publicUrl);
    }
  }
  return { ready: false, url: publicUrl };
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

}());
