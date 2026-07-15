(function () {
const root = document.querySelector("[data-notes-admin]");
const tools = window.TomfngNoteTools;
if (!root || root.dataset.ready === "true" || !tools) return;
root.dataset.ready = "true";

const {
  createHtmlToMarkdown,
  editMarkdownTable,
  escapeHtml,
  extractMarkdownHeadings,
  extractNoteCover,
  filterNotesByQuery,
  findMarkdownFootnoteDefinition,
  formatRelativeTime,
  getNoteListStatus,
  isRemoteDraftPath,
  orderNotesWithPinsAndTree,
  selectVisibleNotes,
  searchNotesWithSnippets,
  findMarkdownImageAt,
  findMarkdownLinkAt,
  formatMarkdownImage,
  formatMarkdownImageSize,
  formatMarkdownLink,
  formatDate,
  getMarkdownTableContext,
  lineHasGfmHardBreak,
  makeId,
  makeSlug,
  markdownBlockTemplate,
  markdownEmptyBlockEnterEdit,
  markdownFootnoteTemplate,
  markdownListBackspaceEdit,
  markdownListJoinBackspaceEdit,
  markdownPairBackspaceEdit,
  markdownPairInputEdit,
  markdownSoftBreakInsert,
  markdownTableKeyboardEdit,
  markdownToHtml,
  normalizeLibraryState,
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
  stripMarkdownBlockPrefix,
  toggleIdInList,
  toggleMarkdownTask,
  touchRecent,
  transformMarkdownBlockLines,
  wouldCreateParentCycle
} = tools;

const STORAGE_KEY = "tomfng-notes-workspace";
const CONFIG_KEY = "tomfng-notes-github-config";
const SESSION_KEY = "tomfng-notes-admin-session";
const EDITOR_MODE_KEY = "tomfng-notes-editor-mode";
const EDITOR_VIEW_KEY = "tomfng-notes-editor-view";
const TYPEWRITER_KEY = "tomfng-notes-typewriter";
const LIBRARY_KEY = "tomfng-notes-library";
const SITE_BASE = "http://tomfng.space";
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_UPLOAD_TOKEN = "tomfng-image-upload";
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CODEMIRROR_MODE_ROOT = "/vendor/codemirror/mode";
const CODEMIRROR_MODE_FILES = new Set([
  "javascript", "python", "shell", "clike", "go", "yaml", "sql", "css", "xml",
  "htmlmixed", "jsx", "powershell", "cmake", "diff", "toml", "stex", "php",
  "nginx", "ruby", "lua", "sass", "rust", "dockerfile", "swift", "dart", "r",
  "perl", "haskell", "julia", "groovy", "protobuf", "commonlisp", "erlang",
  "clojure", "coffeescript", "stylus", "pug", "handlebars", "vue"
]);
const CODEMIRROR_MODE_DEPENDENCIES = {
  htmlmixed: ["xml", "javascript", "css"],
  jsx: ["xml", "javascript"],
  php: ["htmlmixed", "clike"],
  sass: ["css"],
  pug: ["javascript", "css", "htmlmixed"],
  vue: ["xml", "javascript", "coffeescript", "css", "sass", "stylus", "pug", "handlebars"]
};
const codeMirrorModeLoads = new Map();
const OWNER_LOGIN = "Nike232";
const DEFAULT_API_BASE = "https://tomfng-blog-admin.tomfng-space.workers.dev";
const DEFAULT_CONFIG = {
  apiBase: DEFAULT_API_BASE,
  sessionToken: ""
};
const SLASH_COMMAND_KEYWORDS = {
  paragraph: "正文 文本 段落 paragraph text",
  "heading-1": "一级标题 大标题 heading title h1",
  "heading-2": "二级标题 中标题 heading title h2",
  "heading-3": "三级标题 小标题 heading title h3",
  "bullet-list": "无序列表 项目符号 bullet unordered list",
  "ordered-list": "有序列表 编号 number ordered list",
  "task-list": "待办事项 任务 清单 checkbox todo task",
  quote: "引用 引述 blockquote quote",
  "code-block": "代码块 程序 code block",
  mermaid: "流程图 图表 架构图 时序图 diagram flowchart mermaid",
  "math-block": "公式 数学 LaTeX TeX equation math",
  table: "表格 table grid",
  footnote: "脚注 注释 引用 footnote reference",
  "horizontal-rule": "分割线 横线 divider separator hr",
  image: "图片 图像 照片 上传 image photo upload"
};
const initialEditorView = normalizeEditorViewState(loadEditorView());

const state = {
  data: normalizeNotesData({ notes: [] }),
  selectedId: initialEditorView.selectedId || null,
  dirty: false,
  remoteSha: null,
  config: loadConfig(),
  workspaceStarted: false,
  authUser: null,
  busy: false,
  category: initialEditorView.category,
  statusFilter: initialEditorView.statusFilter || "all",
  sortBy: initialEditorView.sortBy || "updated",
  tag: initialEditorView.tag || "all",
  noteQuery: "",
  batchMode: false,
  selectedNoteIds: new Set(),
  library: normalizeLibraryState(loadLibraryState()),
  noteDepthById: new Map(),
  sidebarMode: initialEditorView.sidebarMode,
  editor: null,
  editorNoteId: null,
  editorSessions: new Map(),
  editorView: initialEditorView,
  editorViewTimer: null,
  editorMode: localStorage.getItem(EDITOR_MODE_KEY) === "vim" ? "vim" : "default",
  sourceMode: false,
  vimCursorMode: "normal",
  vimBlockCursor: null,
  typingPulse: null,
  typingTimer: null,
  autosaveTimer: null,
  secondaryRenderTimer: null,
  secondaryRenderWork: null,
  previewDirty: true,
  previewNoteId: null,
  imageUploads: new Map(),
  imageUploadQueue: Promise.resolve(),
  richPasteConverter: null,
  selectionToolbarFrame: null,
  selectionToolbarTimer: null,
  linkPopoverOpen: false,
  linkContext: null,
  tableToolbarFrame: null,
  tableContext: null,
  typewriterFrame: null,
  typewriterMode: localStorage.getItem(TYPEWRITER_KEY) === "1",
  imageResizeFrame: null,
  imageResizeSession: null,
  focusWriting: false,
  blockMenuOpen: false,
  slashMenuOpen: false,
  slashContext: null,
  slashCommands: [],
  slashSelectedIndex: 0,
  slashKeyMap: null,
  autosaveStatus: "saved",
  syncingEditor: false,
  publishPollId: 0
};

const fields = {
  title: root.querySelector("#field-title"),
  slug: root.querySelector("#field-slug"),
  category: root.querySelector("#field-category"),
  tags: root.querySelector("#field-tags"),
  parent: root.querySelector("#field-parent"),
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
  sidebarTitle: root.querySelector("#sidebar-view-title"),
  sidebarPages: root.querySelector("#sidebar-pages"),
  sidebarOutline: root.querySelector("#sidebar-outline"),
  pageActions: root.querySelector("#admin-page-actions"),
  noteSearchWrap: root.querySelector("#admin-note-search-wrap"),
  noteSearch: root.querySelector("#admin-note-search"),
  recentStrip: root.querySelector("#admin-recent-strip"),
  searchResults: root.querySelector("#admin-search-results"),
  filterStack: root.querySelector("#admin-filter-stack"),
  statusStrip: root.querySelector("#admin-status-strip"),
  sortWrap: root.querySelector("#admin-sort-wrap"),
  sortSelect: root.querySelector("#admin-sort"),
  categoryStrip: root.querySelector("#admin-category-strip"),
  tagStrip: root.querySelector("#admin-tag-strip"),
  batchToggle: root.querySelector("#admin-batch-toggle"),
  batchBar: root.querySelector("#admin-batch-bar"),
  batchCount: root.querySelector("#admin-batch-count"),
  batchCategory: root.querySelector("#admin-batch-category"),
  batchDelete: root.querySelector("#admin-batch-delete"),
  batchCancel: root.querySelector("#admin-batch-cancel"),
  categoryOptions: root.querySelector("#category-options"),
  list: root.querySelector("#admin-list"),
  outline: root.querySelector("#admin-outline"),
  form: root.querySelector("#editor-form"),
  status: root.querySelector("#status-text"),
  dirty: root.querySelector("#dirty-state"),
  previewTitle: root.querySelector("#preview-title"),
  previewSummary: root.querySelector("#preview-summary"),
  previewContent: root.querySelector("#preview-content"),
  previewPanel: root.querySelector(".preview-panel"),
  errorTitle: root.querySelector("#error-title"),
  errorSlug: root.querySelector("#error-slug"),
  newNote: root.querySelector("#new-note"),
  duplicateNote: root.querySelector("#duplicate-note"),
  deleteNote: root.querySelector("#delete-note"),
  saveLocal: root.querySelector("#save-local"),
  pullRemote: root.querySelector("#pull-remote"),
  saveDraftRemote: root.querySelector("#save-draft-remote"),
  publishRemote: root.querySelector("#publish-remote"),
  exportWorkspace: root.querySelector("#export-workspace"),
  importWorkspace: root.querySelector("#import-workspace"),
  importWorkspaceFile: root.querySelector("#import-workspace-file"),
  noteHistory: root.querySelector("#note-history"),
  historyDialog: root.querySelector("#admin-history-dialog"),
  historyClose: root.querySelector("#admin-history-close"),
  historyPath: root.querySelector("#admin-history-path"),
  historyList: root.querySelector("#admin-history-list"),
  saveConfig: root.querySelector("#save-config"),
  logoutAdmin: root.querySelector("#logout-admin"),
  toggleVim: root.querySelector("#toggle-vim"),
  toggleSource: root.querySelector("#toggle-source"),
  editorSearch: root.querySelector("#editor-search"),
  toggleTypewriter: root.querySelector("#toggle-typewriter"),
  toggleFocus: root.querySelector("#toggle-focus"),
  selectionToolbar: root.querySelector("#editor-selection-toolbar"),
  linkPopover: root.querySelector("#editor-link-popover"),
  linkLabel: root.querySelector("#editor-link-label"),
  linkUrl: root.querySelector("#editor-link-url"),
  linkError: root.querySelector("#editor-link-error"),
  resourceLabelIcon: root.querySelector("[data-resource-label-icon]"),
  resourceUrlIcon: root.querySelector("[data-resource-url-icon]"),
  linkOpen: root.querySelector('[data-link-action="open"]'),
  linkRemove: root.querySelector('[data-link-action="remove"]'),
  linkApply: root.querySelector('[data-link-action="apply"]'),
  tableToolbar: root.querySelector("#editor-table-toolbar"),
  blockToggle: root.querySelector("#editor-block-toggle"),
  blockMenu: root.querySelector("#editor-block-menu"),
  slashMenu: root.querySelector("#editor-slash-menu"),
  imagePicker: root.querySelector("#editor-image-picker"),
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
    state.selectedId = state.data.notes.some((note) => note.id === state.selectedId)
      ? state.selectedId
      : state.data.notes[0]?.id || null;
    const recovered = clearStaleImageUploadTokens();
    if (recovered) markDirty(`已清理 ${recovered} 个未完成的图片上传`);
    else setStatus("已载入本地草稿");
  } else {
    state.data = normalizeNotesData({ notes: [] });
  }
  render();
  await syncRemotePosts({ initial: true });
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
  elements.saveDraftRemote?.addEventListener("click", saveDraftRemote);
  elements.publishRemote.addEventListener("click", publishRemote);
  elements.exportWorkspace?.addEventListener("click", exportWorkspace);
  elements.importWorkspace?.addEventListener("click", () => elements.importWorkspaceFile?.click());
  elements.importWorkspaceFile?.addEventListener("change", importWorkspaceFromFile);
  elements.noteHistory?.addEventListener("click", openNoteHistory);
  elements.historyClose?.addEventListener("click", () => elements.historyDialog?.close?.());
  elements.saveConfig.addEventListener("click", saveConfig);
  elements.logoutAdmin.addEventListener("click", logoutAdmin);
  elements.toggleVim.addEventListener("click", toggleEditorMode);
  elements.toggleSource.addEventListener("click", () => toggleSourceMode());
  elements.editorSearch.addEventListener("click", openEditorSearch);
  elements.toggleTypewriter?.addEventListener("click", () => toggleTypewriterMode());
  elements.toggleFocus.addEventListener("click", () => toggleFocusWriting());
  elements.blockToggle.addEventListener("click", () => toggleBlockMenu());
  elements.blockMenu.querySelectorAll("[data-block-command]").forEach((button) => {
    button.addEventListener("click", () => applyBlockCommand(button.dataset.blockCommand));
  });
  elements.slashMenu.addEventListener("mousedown", (event) => event.preventDefault());
  elements.slashMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slash-command]");
    if (button) executeSlashCommand(button.dataset.slashCommand);
  });
  elements.slashMenu.addEventListener("pointermove", (event) => {
    const button = event.target.closest("[data-slash-index]");
    if (!button) return;
    setSlashSelection(Number(button.dataset.slashIndex), false);
  });
  elements.imagePicker.addEventListener("change", () => {
    const files = [...(elements.imagePicker.files || [])];
    elements.imagePicker.value = "";
    if (files.length) insertImageUploads(files);
  });
  elements.noteSearch.addEventListener("input", () => {
    state.noteQuery = elements.noteSearch.value;
    pruneBatchSelection();
    renderList();
    renderSidebarMode();
  });
  elements.noteSearch.addEventListener("keydown", handleNoteSearchKeydown);
  elements.list.addEventListener("keydown", handleNoteListKeydown);
  elements.sortSelect?.addEventListener("change", () => {
    state.sortBy = elements.sortSelect.value || "updated";
    pruneBatchSelection();
    ensureSelectedVisible();
    persistEditorView();
    render();
  });
  elements.batchToggle?.addEventListener("click", () => setBatchMode(!state.batchMode));
  elements.batchCancel?.addEventListener("click", () => setBatchMode(false));
  elements.batchCategory?.addEventListener("click", batchChangeCategory);
  elements.batchDelete?.addEventListener("click", batchDeleteNotes);
  elements.sidebarPages.addEventListener("click", () => setSidebarMode("pages"));
  elements.sidebarOutline.addEventListener("click", () => setSidebarMode("outline"));
  elements.selectionToolbar.addEventListener("mousedown", (event) => event.preventDefault());
  elements.selectionToolbar.querySelectorAll("[data-editor-command]").forEach((button) => {
    button.addEventListener("click", () => applyMarkdownCommand(button.dataset.editorCommand));
  });
  elements.linkPopover.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.linkPopover.querySelectorAll("[data-link-action]").forEach((button) => {
    button.addEventListener("click", () => handleLinkPopoverAction(button.dataset.linkAction));
  });
  [elements.linkLabel, elements.linkUrl].forEach((input) => {
    input.addEventListener("input", clearLinkPopoverError);
    input.addEventListener("keydown", handleLinkPopoverKeydown);
  });
  elements.tableToolbar.addEventListener("mousedown", (event) => event.preventDefault());
  elements.tableToolbar.querySelectorAll("[data-table-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.tableValue || "";
      const nextValue = button.dataset.tableAction === "align" && state.tableContext?.alignment === value
        ? "none"
        : value;
      applyTableAction(button.dataset.tableAction, nextValue);
    });
  });
  Object.values(fields).forEach((field) => field.addEventListener("input", updateSelectedFromFields));
  fields.title.addEventListener("input", autoSizeTitleField);
  elements.previewPanel.addEventListener("toggle", () => {
    if (!elements.previewPanel.open) return;
    const note = getSelectedNote();
    if (note) renderPreview(note, { force: true });
  });
  elements.form.addEventListener("submit", (event) => event.preventDefault());
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
      const vim = state.editorMode === "vim" && state.editor?.hasFocus?.() ? state.editor.state?.vim : null;
      if (vim && !vim.insertMode && !vim.visualMode) return;
      event.preventDefault();
      openPageSearch();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a" && state.batchMode) {
      const target = event.target;
      if (target && (target.closest?.("input, textarea, select, .CodeMirror") || target.isContentEditable)) return;
      event.preventDefault();
      selectAllVisibleNotes();
      return;
    }
    if (event.key !== "Escape") return;
    if (state.linkPopoverOpen) {
      closeLinkPopover({ restoreFocus: true });
      return;
    }
    if (state.slashMenuOpen) {
      closeSlashMenu();
      return;
    }
    if (state.blockMenuOpen) {
      toggleBlockMenu(false);
      return;
    }
    if (state.batchMode) {
      setBatchMode(false);
      return;
    }
    if (state.focusWriting) toggleFocusWriting(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (state.linkPopoverOpen && !elements.linkPopover.contains(event.target)) closeLinkPopover();
    if (state.slashMenuOpen && !elements.slashMenu.contains(event.target)) closeSlashMenu();
    if (state.blockMenuOpen && !elements.blockMenu.contains(event.target) && !elements.blockToggle.contains(event.target)) {
      toggleBlockMenu(false);
    }
  });
  window.addEventListener("resize", autoSizeTitleField);
  window.addEventListener("resize", positionLinkPopover);
  window.addEventListener("resize", positionBlockMenu);
  window.addEventListener("resize", positionSlashMenu);
  window.addEventListener("resize", scheduleTableToolbar);
  window.addEventListener("scroll", () => {
    if (state.blockMenuOpen) toggleBlockMenu(false);
    if (state.slashMenuOpen) positionSlashMenu();
    if (state.linkPopoverOpen) positionLinkPopover();
    scheduleTableToolbar();
    scheduleEditorViewSave();
  }, { passive: true });
  window.addEventListener("beforeunload", flushEditorSession);
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

function loadCodeMirrorMode(mode, onLoad, onError) {
  ensureCodeMirrorMode(mode).then(onLoad).catch(onError);
}

function ensureCodeMirrorMode(mode) {
  const name = String(mode || "").toLowerCase();
  const CodeMirror = window.CodeMirror;
  if (!CodeMirror || !/^[a-z0-9_-]+$/.test(name)) {
    return Promise.reject(new Error(`无法加载代码语言：${name || "unknown"}`));
  }
  if (Object.prototype.hasOwnProperty.call(CodeMirror.modes, name)) {
    return Promise.resolve();
  }
  if (!CODEMIRROR_MODE_FILES.has(name)) {
    definePlainCodeMirrorMode(name);
    return Promise.resolve();
  }
  if (codeMirrorModeLoads.has(name)) return codeMirrorModeLoads.get(name);

  const loading = Promise.all(
    (CODEMIRROR_MODE_DEPENDENCIES[name] || []).map((dependency) => ensureCodeMirrorMode(dependency))
  )
    .then(() => injectCodeMirrorModeScript(name))
    .catch((error) => {
      codeMirrorModeLoads.delete(name);
      throw error;
    });
  codeMirrorModeLoads.set(name, loading);
  return loading;
}

function injectCodeMirrorModeScript(mode) {
  if (Object.prototype.hasOwnProperty.call(window.CodeMirror.modes, mode)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${CODEMIRROR_MODE_ROOT}/${mode}/${mode}.js`;
    script.dataset.codemirrorMode = mode;
    script.onload = () => {
      if (Object.prototype.hasOwnProperty.call(window.CodeMirror.modes, mode)) {
        resolve();
        return;
      }
      script.remove();
      reject(new Error(`代码语言 ${mode} 加载后未注册`));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`代码语言 ${mode} 加载失败`));
    };
    document.head.appendChild(script);
  });
}

function definePlainCodeMirrorMode(mode) {
  if (Object.prototype.hasOwnProperty.call(window.CodeMirror.modes, mode)) return;
  window.CodeMirror.defineMode(mode, () => ({
    token(stream) {
      stream.skipToEnd();
      return null;
    }
  }));
}

function installCodeMirrorLanguageAliases() {
  const CodeMirror = window.CodeMirror;
  const originalFindMode = CodeMirror?.findModeByName;
  if (!originalFindMode || originalFindMode.tomfngExtended) return;

  function findModeByLanguage(language) {
    const direct = originalFindMode.call(CodeMirror, language);
    if (direct) return direct;
    const requested = String(language || "").toLowerCase();
    return CodeMirror.modeInfo.find((info) => {
      const mimes = info.mimes || (info.mime ? [info.mime] : []);
      return String(info.mode || "").toLowerCase() === requested
        || (info.ext || []).some((extension) => extension.toLowerCase() === requested)
        || mimes.some((mime) => mime.toLowerCase() === requested);
    });
  }

  findModeByLanguage.tomfngExtended = true;
  CodeMirror.findModeByName = findModeByLanguage;
}

function installMermaidCodeRenderer() {
  const FoldCode = window.HyperMD?.FoldCode;
  if (!FoldCode?.registerRenderer) return false;
  if (FoldCode.rendererRegistry?.mermaid) return true;

  FoldCode.registerRenderer({
    name: "mermaid",
    pattern: /^(?:mermaid|mmd)$/i,
    renderer(code, info) {
      const container = document.createElement("div");
      container.className = "note-mermaid-diagram is-loading";
      container.setAttribute("aria-busy", "true");
      container.innerHTML = `
        <div class="note-mermaid-stage" aria-live="polite">
          <span class="note-mermaid-skeleton" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <button class="note-mermaid-edit" type="button" title="编辑 Mermaid 源码" aria-label="编辑 Mermaid 源码"><i class="fa-solid fa-pen"></i></button>
      `;
      const stage = container.querySelector(".note-mermaid-stage");
      let active = true;

      const openSource = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (!active) return;
        info.break();
        info.editor.focus();
      };
      container.addEventListener("click", openSource);
      container.querySelector(".note-mermaid-edit").addEventListener("click", openSource);
      info.onRemove = () => {
        active = false;
        window.TomfngMermaid?.cancel(stage);
      };

      if (!window.TomfngMermaid?.render) {
        container.classList.remove("is-loading");
        container.classList.add("is-error");
        container.removeAttribute("aria-busy");
        stage.innerHTML = '<strong>图表组件未加载</strong><small>点击返回 Mermaid 源码</small>';
        return container;
      }

      window.TomfngMermaid.render(code, stage, {
        idPrefix: "tomfng-editor-mermaid",
        label: "Mermaid 图表"
      }).then((result) => {
        if (!active || result.cancelled) return;
        container.classList.remove("is-loading");
        container.classList.add("is-rendered");
        container.removeAttribute("aria-busy");
        info.changed();
      }).catch((error) => {
        if (!active) return;
        container.classList.remove("is-loading");
        container.classList.add("is-error");
        container.removeAttribute("aria-busy");
        stage.innerHTML = "";
        const label = document.createElement("strong");
        label.textContent = error?.code === "MERMAID_LOAD_FAILED" ? "图表加载失败" : "图表语法有误";
        const detail = document.createElement("small");
        detail.textContent = window.TomfngMermaid.conciseError(error);
        stage.append(label, detail);
        info.changed();
      });

      return container;
    }
  });
  return true;
}

function initMarkdownEditor() {
  if (!window.CodeMirror) {
    fields.content.classList.add("is-fallback-editor");
    bindFallbackImageTransfers();
    updateEditorStats();
    return;
  }

  installCodeMirrorLanguageAliases();
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
  const katexRenderer = window.HyperMD_PowerPack?.["fold-math-with-katex"]?.KatexRenderer || null;
  const mermaidRenderer = useHyperMD && installMermaidCodeRenderer();

  const editorOptions = {
    mode: useHyperMD ? {
      name: "hypermd",
      fencedCodeBlockHighlighting: true
    } : {
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
    phrases: {
      "Search:": "查找：",
      "(Use /re/ syntax for regexp search)": "支持 /正则表达式/",
      "With:": "替换为：",
      "Replace?": "替换当前匹配？",
      Yes: "替换",
      No: "跳过",
      All: "全部替换",
      Stop: "结束",
      "Replace all:": "全部查找：",
      "Replace:": "查找替换：",
      "Replace with:": "替换为："
    },
    foldGutter: false,
    gutters: [],
    hmdHideToken: true,
    hmdFold: getLiveFoldOptions(katexRenderer),
    hmdFoldMath: katexRenderer ? { renderer: katexRenderer } : false,
    hmdFoldCode: mermaidRenderer ? { mermaid: true } : false,
    hmdInsertFile: false,
    hmdReadLink: { baseURI: `${window.location.origin}/` },
    hmdModeLoader: useHyperMD ? loadCodeMirrorMode : false,
    extraKeys: {
      Enter(cm) {
        if (applyMarkdownTableKey(cm, "enter")) return;
        if (applyEmptyBlockEnter(cm)) return;
        cm.execCommand(enterCommand);
      },
      "Shift-Enter"(cm) {
        if (applySoftBreak(cm)) return;
        cm.execCommand(shiftEnterCommand);
      },
      Tab(cm) {
        if (applyMarkdownTableKey(cm, "next")) return;
        if (tabCommand) {
          window.CodeMirror.commands[tabCommand](cm);
          return;
        }
        cm.replaceSelection("  ", "end");
      },
      "Shift-Tab"(cm) {
        if (applyMarkdownTableKey(cm, "prev")) return;
        if (shiftTabCommand) {
          if (typeof shiftTabCommand === "string") cm.execCommand(shiftTabCommand);
          else window.CodeMirror.commands[shiftTabCommand]?.(cm);
          return;
        }
        cm.execCommand("indentLess");
      },
      Up(cm) {
        if (applyMarkdownTableKey(cm, "up")) return;
        return window.CodeMirror.Pass;
      },
      Down(cm) {
        if (applyMarkdownTableKey(cm, "down")) return;
        return window.CodeMirror.Pass;
      },
      "Ctrl-S"(cm) {
        cm.save();
        saveWorkspace();
      },
      "Cmd-S"(cm) {
        cm.save();
        saveWorkspace();
      },
      "Ctrl-B": markdownShortcut("bold"),
      "Cmd-B": markdownShortcut("bold", false),
      "Ctrl-I": markdownShortcut("italic"),
      "Cmd-I": markdownShortcut("italic", false),
      "Ctrl-K": markdownShortcut("link"),
      "Cmd-K": markdownShortcut("link", false),
      "Alt-Shift-5": markdownShortcut("strike", false),
      "Ctrl-1": markdownShortcut("heading-1"),
      "Ctrl-2": markdownShortcut("heading-2"),
      "Ctrl-3": markdownShortcut("heading-3"),
      "Ctrl-0": markdownShortcut("paragraph"),
      "Ctrl-/": sourceModeShortcut(true),
      "Cmd-/": sourceModeShortcut(false),
      "Ctrl-F": searchShortcut("findPersistent", true),
      "Cmd-F": searchShortcut("findPersistent", false),
      "Ctrl-H": searchShortcut("replace", true),
      "Cmd-Alt-F": searchShortcut("replace", false),
      "Ctrl-P": pageSearchShortcut(true),
      "Cmd-P": pageSearchShortcut(false),
      "Ctrl-Shift-7": blockShortcut("ordered-list", true),
      "Cmd-Shift-7": blockShortcut("ordered-list", false),
      "Ctrl-Shift-8": blockShortcut("bullet-list", true),
      "Cmd-Shift-8": blockShortcut("bullet-list", false),
      "Ctrl-Shift-9": blockShortcut("quote", true),
      "Cmd-Shift-9": blockShortcut("quote", false),
      F9: () => toggleFocusWriting(),
      F10: () => toggleTypewriterMode()
    }
  };

  state.editor = useHyperMD
    ? window.HyperMD.fromTextArea(fields.content, editorOptions)
    : window.CodeMirror.fromTextArea(fields.content, editorOptions);

  state.editor.on("keydown", handleEditorRawShortcut);
  state.editor.on("renderLine", decorateEditorFootnotes);
  state.editor.on("renderLine", decorateEditorSoftBreaks);
  bindEditorImageTransfers();
  bindEditorLinkEditing();
  bindEditorImageResize();
  bindEditorTaskToggles();
  bindEditorFootnoteJumps();
  syncTypewriterButton();
  if (state.typewriterMode) scheduleTypewriterCenter(true);

  state.editor.on("change", (_cm, change) => {
    if (state.syncingEditor) return;
    fields.content.value = state.editor.getValue();
    updateSelectedFromFields();
    updateEditorStats();
    triggerTypingPulse(change);
    syncSlashMenuFromEditor({ allowOpen: isSlashTriggerChange(change) });
    scheduleTableToolbar();
  });
  state.editor.on("cursorActivity", () => {
    updateEditorStats();
    syncEditorCursorStyle();
    scheduleSelectionToolbar();
    scheduleTableToolbar();
    scheduleTypewriterCenter();
    updateOutlineActiveState();
    scheduleEditorViewSave();
    if (state.slashMenuOpen) syncSlashMenuFromEditor();
  });
  state.editor.on("focus", () => {
    setEditorFocusState(true);
    scheduleSelectionToolbar();
    scheduleTableToolbar();
  });
  state.editor.on("blur", () => {
    setEditorFocusState(false);
    hideSelectionToolbar();
    hideTableToolbar();
    if (state.slashMenuOpen) closeSlashMenu();
  });
  state.editor.on("vim-mode-change", (_cm, event) => {
    state.vimCursorMode = event?.mode || "normal";
    syncEditorCursorStyle();
  });
  state.editor.on("scroll", () => {
    syncEditorCursorStyle();
    hideSelectionToolbar();
    scheduleTableToolbar();
    if (state.linkPopoverOpen) positionLinkPopover();
    if (state.blockMenuOpen) toggleBlockMenu(false);
    if (state.slashMenuOpen) closeSlashMenu();
    scheduleEditorViewSave();
  });
  syncEditorCursorStyle();
  setEditorFocusState(state.editor.hasFocus?.());
  decorateEditorFootnotes(null, null, state.editor.getWrapperElement?.());
  updateEditorStats();
}

function bindEditorImageTransfers() {
  if (!state.editor) return;
  const wrapper = state.editor.getWrapperElement?.();

  state.editor.on("paste", (_cm, event) => {
    const files = imageFilesFromTransfer(event.clipboardData || window.clipboardData);
    if (files.length) {
      event.preventDefault();
      insertImageUploads(files);
      return;
    }
    handleSmartPaste(event);
  });

  state.editor.on("dragover", (_cm, event) => {
    if (!event.dataTransfer?.types?.includes?.("Files")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    wrapper?.classList.add("is-image-dragover");
  });
  state.editor.on("dragleave", (_cm, event) => {
    if (!wrapper || wrapper.contains(event.relatedTarget)) return;
    wrapper.classList.remove("is-image-dragover");
  });
  state.editor.on("drop", (cm, event) => {
    wrapper?.classList.remove("is-image-dragover");
    const files = imageFilesFromTransfer(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    cm.setCursor(cm.coordsChar({ left: event.clientX, top: event.clientY }, "window"));
    insertImageUploads(files);
  });
}

function bindEditorTaskToggles() {
  const cm = state.editor;
  const wrapper = cm?.getWrapperElement?.();
  if (!wrapper) return;

  wrapper.addEventListener("click", (event) => {
    const marker = event.target.closest?.("span.cm-formatting-task");
    if (!marker || state.sourceMode || event.button !== 0) return;
    const bounds = marker.getBoundingClientRect();
    const line = cm.lineAtHeight((bounds.top + bounds.bottom) / 2, "window");
    const toggled = toggleMarkdownTask(cm.getLine(line));
    if (!toggled || !requireOwnerAccess()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const cursor = cm.getCursor();
    cm.operation(() => {
      cm.replaceRange(
        toggled.checked ? "x" : " ",
        { line, ch: toggled.stateCh },
        { line, ch: toggled.stateCh + 1 },
        "+task-toggle"
      );
      cm.setCursor(cursor);
    });
    cm.focus();
  }, true);
}

function bindEditorLinkEditing() {
  const cm = state.editor;
  const wrapper = cm?.getWrapperElement?.();
  if (!wrapper) return;

  wrapper.addEventListener("click", (event) => {
    if (state.sourceMode || event.button !== 0) return;
    const imageTarget = event.target.closest?.("img.hmd-image, span.cm-image, span.cm-formatting-image");
    const target = imageTarget || event.target.closest?.("span.cm-link, span.cm-url, span.hmd-link-icon");
    if (!target) return;
    const position = cm.coordsChar({ left: event.clientX, top: event.clientY }, "window");
    const parsed = imageTarget
      ? findMarkdownImageAt(cm.getLine(position.line), position.ch)
      : findMarkdownLinkAt(cm.getLine(position.line), position.ch);
    if (!parsed) return;
    const context = imageTarget
      ? imageContextFromParsed(position.line, parsed)
      : linkContextFromParsed(position.line, parsed);
    if (imageTarget) {
      context.block = cm.getLine(position.line).trim() === cm.getRange(context.from, context.to);
      context.anchor = {
        left: event.clientX,
        right: event.clientX,
        top: event.clientY,
        bottom: event.clientY
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      // Typora-like: single click places the caret after the image; edit on double-click / Alt-click.
      if (event.detail < 2 && !event.altKey) {
        cm.focus();
        cm.setCursor(imageReturnCursor(context, cm, context.to.ch));
        return;
      }
      openLinkPopover(context, { focus: event.altKey ? "url" : "label" });
      return;
    }
    openLinkPopover(context, { focus: "url" });
  }, true);
}

function decorateEditorFootnotes(_cm, _line, element) {
  element?.querySelectorAll?.("span.cm-hmd-footref:not(.cm-formatting)").forEach((reference) => {
    const label = reference.textContent.replace(/^\^/, "").trim();
    if (!label) return;
    reference.dataset.footnoteLabel = label;
    reference.setAttribute("aria-label", `脚注 ${label}`);
    reference.title = "点击跳转到脚注定义";
  });
}

function bindEditorFootnoteJumps() {
  const cm = state.editor;
  const wrapper = cm?.getWrapperElement?.();
  if (!wrapper) return;
  wrapper.addEventListener("click", (event) => {
    if (state.sourceMode || event.button !== 0) return;
    const target = event.target.closest?.("span.cm-hmd-footref");
    if (!target || target.classList.contains("cm-formatting")) return;
    const label = target.dataset.footnoteLabel || target.textContent.replace(/^\^/, "").trim();
    if (!label) return;
    const definition = findMarkdownFootnoteDefinition(cm.getValue().split("\n"), label);
    if (!definition) return;
    event.preventDefault();
    event.stopPropagation();
    cm.focus();
    cm.setCursor(definition);
    cm.scrollIntoView(definition, 80);
  }, true);
}

function handleSmartPaste(event) {
  if (!state.editor) return false;
  const clipboard = event.clipboardData || window.clipboardData;
  if (!clipboard) return false;
  const text = String(clipboard.getData("text/plain") || "").trim();
  const selection = state.editor.getSelection();
  const url = normalizePastedLink(text);

  if (url && selection && !selection.includes("\n")) {
    event.preventDefault();
    const label = selection.replace(/([\\\]])/g, "\\$1");
    state.editor.replaceSelection(`[${label}](${url})`, "end", "+smart-paste");
    return true;
  }

  const html = String(clipboard.getData("text/html") || "");
  if (!html || !/<(?:h[1-6]|p|div|br|ul|ol|li|blockquote|pre|code|strong|b|em|i|del|s|a|img|table)\b/i.test(html)) {
    return false;
  }
  const convert = getRichPasteConverter();
  const markdown = convert ? convert(html) : "";
  if (!markdown) return false;
  event.preventDefault();
  state.editor.replaceSelection(markdown, "around", "+rich-paste");
  return true;
}

function getRichPasteConverter() {
  if (state.richPasteConverter === false) return null;
  if (typeof state.richPasteConverter === "function") return state.richPasteConverter;
  const converter = createHtmlToMarkdown?.(window.TurndownService, window.turndownPluginGfm);
  state.richPasteConverter = converter || false;
  return converter;
}

function normalizePastedLink(value) {
  const url = String(value || "").trim().replace(/\s/g, "%20").replace(/\)/g, "%29");
  if (/^https?:\/\/[^\s]+$/i.test(url) || /^mailto:[^\s]+$/i.test(url) || /^\/(?!\/)[^\s]+$/.test(url)) return url;
  return "";
}

function applyMarkdownCommand(command, cm = state.editor) {
  if (!cm || !requireOwnerAccess()) return;
  if (command === "link") {
    applyLinkCommand(cm);
    return;
  }
  const marks = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    strike: ["~~", "~~"],
    code: ["`", "`"],
    math: ["$", "$"]
  };

  cm.operation(() => {
    if (command.startsWith("heading-")) {
      applyHeadingCommand(cm, Number(command.slice(-1)));
    } else if (command === "paragraph") {
      applyParagraphCommand(cm);
    } else if (marks[command]) {
      applyInlineMarks(cm, marks[command][0], marks[command][1], command === "code");
    }
  });
  cm.focus();
  scheduleSelectionToolbar();
}

function markdownShortcut(command, respectVimNormal = true) {
  return (cm) => {
    const vim = state.editorMode === "vim" ? cm.state?.vim : null;
    if (respectVimNormal && vim && !vim.insertMode && !vim.visualMode) return window.CodeMirror.Pass;
    applyMarkdownCommand(command, cm);
    return undefined;
  };
}

function handleEditorRawShortcut(cm, event) {
  if (handleMarkdownPairKeydown(cm, event)) return;
  const key = String(event.key || "").toLowerCase();
  const keyCode = Number(event.keyCode || event.which || 0);
  const mathModifiers = (event.shiftKey && !event.altKey) || (event.altKey && !event.shiftKey);
  if (
    !(event.ctrlKey || event.metaKey)
    || !mathModifiers
    || (key !== "m" && keyCode !== 77)
  ) return;
  const vim = state.editorMode === "vim" ? cm.state?.vim : null;
  if (vim && !vim.insertMode && !vim.visualMode) return;
  event.preventDefault();
  event.stopPropagation();
  applyMarkdownCommand("math", cm);
}

function handleMarkdownPairKeydown(cm, event) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const vim = state.editorMode === "vim" ? cm.state?.vim : null;
  if (vim && !vim.insertMode && state.vimCursorMode !== "insert" && state.vimCursorMode !== "replace") return false;
  const selections = cm.listSelections();
  if (selections.length !== 1) return false;
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  if (from.line !== to.line) return false;

  const line = cm.getLine(from.line);
  let edit = null;
  let listStructural = false;
  let joinEdit = null;
  if (event.key === "Backspace") {
    if (from.ch !== to.ch) return false;
    if (from.ch === 0 && from.line > 0) {
      joinEdit = markdownListJoinBackspaceEdit(cm.getLine(from.line - 1), line);
      if (joinEdit) {
        event.preventDefault();
        event.stopPropagation();
        const prevLine = from.line - 1;
        cm.operation(() => {
          cm.replaceRange(
            joinEdit.previousText,
            { line: prevLine, ch: 0 },
            { line: from.line, ch: line.length },
            "+delete"
          );
          cm.setCursor({ line: prevLine, ch: joinEdit.selectionStart });
          renumberOrderedListsNear(cm, prevLine);
        });
        return true;
      }
    }
    const pairEdit = markdownPairBackspaceEdit(line, from.ch);
    const listEdit = pairEdit ? null : markdownListBackspaceEdit(line, from.ch);
    edit = pairEdit || listEdit;
    listStructural = Boolean(listEdit);
  } else {
    edit = markdownPairInputEdit(line, from.ch, to.ch, event.key);
  }
  if (!edit) return false;
  if (edit.type !== "skip" && markdownPairingBlocked(cm, from, event.key, edit)) return false;

  event.preventDefault();
  event.stopPropagation();
  if (edit.type === "skip") {
    cm.setCursor({ line: from.line, ch: edit.cursor });
    return true;
  }

  const rangeFrom = { line: from.line, ch: edit.from };
  const rangeTo = { line: from.line, ch: edit.to };
  const startIndex = cm.indexFromPos(rangeFrom);
  cm.operation(() => {
    cm.replaceRange(edit.text, rangeFrom, rangeTo, event.key === "Backspace" ? "+delete" : "+input");
    cm.setSelection(
      cm.posFromIndex(startIndex + edit.selectionStart),
      cm.posFromIndex(startIndex + edit.selectionEnd)
    );
    if (listStructural) renumberOrderedListsNear(cm, from.line);
  });
  return true;
}

function renumberOrderedListsNear(cm, pivotLine) {
  if (!cm) return;
  const lines = cm.getValue().split("\n");
  const patches = [];
  const seen = new Set();
  [pivotLine, pivotLine - 1, pivotLine + 1].forEach((probe) => {
    if (probe < 0 || probe >= lines.length) return;
    const result = renumberMarkdownOrderedList(lines, probe);
    if (!result || seen.has(`${result.fromLine}:${result.toLine}`)) return;
    seen.add(`${result.fromLine}:${result.toLine}`);
    patches.push(result);
  });
  patches
    .sort((a, b) => b.fromLine - a.fromLine)
    .forEach((result) => {
      cm.replaceRange(
        result.lines.join("\n"),
        { line: result.fromLine, ch: 0 },
        { line: result.toLine, ch: cm.getLine(result.toLine).length },
        "+list-renumber"
      );
    });
}

function applyMarkdownTableKey(cm, action) {
  if (!cm || state.sourceMode) return false;
  if (cm.listSelections().length !== 1) return false;
  const cursor = cm.getCursor();
  const result = markdownTableKeyboardEdit(cm.getValue().split("\n"), cursor, action);
  if (!result) return false;
  cm.operation(() => {
    if (result.lines) {
      cm.replaceRange(
        result.lines.join("\n"),
        { line: result.fromLine, ch: 0 },
        { line: result.toLine, ch: cm.getLine(result.toLine).length },
        "+table-nav"
      );
    }
    cm.setSelection(result.selection.from, result.selection.to);
  });
  scheduleTableToolbar();
  return true;
}

function applyEmptyBlockEnter(cm) {
  if (!cm || cm.listSelections().length !== 1 || cm.somethingSelected()) return false;
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  if (cursor.ch < line.length) return false;
  const edit = markdownEmptyBlockEnterEdit(line);
  if (!edit) return false;
  cm.operation(() => {
    cm.replaceRange(
      `${edit.text}\n`,
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length },
      "+empty-block-exit"
    );
    cm.setCursor({ line: cursor.line + 1, ch: edit.cursor });
  });
  return true;
}

function getLiveFoldOptions(katexRenderer = window.HyperMD_PowerPack?.["fold-math-with-katex"]?.KatexRenderer || null) {
  return {
    code: true,
    emoji: true,
    image: true,
    link: true,
    math: Boolean(katexRenderer)
  };
}

function markdownPairingBlocked(cm, cursor, key, edit) {
  if (edit.text.includes("\n")) return false;
  const probe = { line: cursor.line, ch: Math.max(0, cursor.ch - 1) };
  const tokenType = cm.getTokenTypeAt?.(probe) || "";
  if (!/\b(?:comment|string|code)\b/.test(tokenType)) return false;
  return key !== "Backspace";
}

function applyInlineMarks(cm, open, close, codeStyle) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const selected = cm.getRange(from, to);
  if (codeStyle && selected.includes("\n")) {
    const block = `\n\n\`\`\`\n${selected}\n\`\`\`\n\n`;
    cm.replaceRange(block, from, to, "+format");
    return;
  }
  if (!selected) {
    cm.replaceRange(`${open}${close}`, from, to, "+format");
    cm.setCursor({ line: from.line, ch: from.ch + open.length });
    return;
  }

  const line = cm.getLine(from.line);
  const sameLine = from.line === to.line;
  const outsideOpen = sameLine && from.ch >= open.length && line.slice(from.ch - open.length, from.ch) === open;
  const outsideClose = sameLine && line.slice(to.ch, to.ch + close.length) === close;
  if (outsideOpen && outsideClose) {
    const rangeFrom = { line: from.line, ch: from.ch - open.length };
    const rangeTo = { line: to.line, ch: to.ch + close.length };
    cm.replaceRange(selected, rangeFrom, rangeTo, "+format");
    cm.setSelection(rangeFrom, { line: rangeFrom.line, ch: rangeFrom.ch + selected.length });
    return;
  }
  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length);
    cm.replaceRange(inner, from, to, "+format");
    cm.setSelection(from, { line: from.line, ch: from.ch + inner.length });
    return;
  }
  cm.replaceRange(`${open}${selected}${close}`, from, to, "+format");
  cm.setSelection(
    { line: from.line, ch: from.ch + open.length },
    { line: to.line, ch: to.ch + (from.line === to.line ? open.length : 0) }
  );
}

function applyLinkCommand(cm) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const selected = cm.getRange(from, to);
  if (selected.includes("\n")) {
    setStatus("链接文字需要在同一行", true);
    return;
  }

  const line = cm.getLine(from.line);
  const parsed = findMarkdownLinkAt(line, from.ch) || findMarkdownLinkAt(line, to.ch);
  if (parsed) {
    openLinkPopover(linkContextFromParsed(from.line, parsed), { focus: "url" });
    return;
  }

  let rangeFrom = from;
  let rangeTo = to;
  let label = selected;
  if (!label) {
    const word = markdownWordRange(line, from.ch);
    rangeFrom = { line: from.line, ch: word.from };
    rangeTo = { line: from.line, ch: word.to };
    label = line.slice(word.from, word.to);
  }
  openLinkPopover({
    from: rangeFrom,
    to: rangeTo,
    label,
    url: "",
    titleSuffix: "",
    type: "link",
    isNew: true
  }, { focus: label ? "url" : "label" });
}

function markdownWordRange(line, ch) {
  const value = String(line || "");
  let from = Math.max(0, Math.min(value.length, Number(ch) || 0));
  let to = from;
  const isWord = (char) => Boolean(char && !/[\s`*_{}\[\]()<>]/.test(char));
  while (from > 0 && isWord(value[from - 1])) from -= 1;
  while (to < value.length && isWord(value[to])) to += 1;
  return { from, to };
}

function linkContextFromParsed(line, parsed) {
  return {
    from: { line, ch: parsed.from },
    to: { line, ch: parsed.to },
    label: parsed.label,
    url: parsed.url,
    titleSuffix: parsed.titleSuffix,
    type: "link",
    isNew: false
  };
}

function imageContextFromParsed(line, parsed) {
  return {
    from: { line, ch: parsed.from },
    to: { line, ch: parsed.to },
    label: parsed.alt,
    url: parsed.url,
    titleSuffix: parsed.titleSuffix,
    type: "image",
    isNew: false
  };
}

function openLinkPopover(context, { focus = "url" } = {}) {
  if (!context || !state.editor) return;
  if (state.blockMenuOpen) toggleBlockMenu(false);
  if (state.slashMenuOpen) closeSlashMenu();
  hideSelectionToolbar();
  hideTableToolbar();
  clearLinkPopoverError();
  state.linkContext = context;
  state.linkPopoverOpen = true;
  configureInlineResourcePopover(context);
  elements.linkLabel.value = context.label || "";
  elements.linkUrl.value = context.url || "";
  elements.linkPopover.hidden = false;
  elements.linkPopover.classList.toggle("is-new", Boolean(context.isNew));
  elements.linkRemove.disabled = Boolean(context.isNew);
  positionLinkPopover();
  window.requestAnimationFrame(() => {
    const input = focus === "label" ? elements.linkLabel : elements.linkUrl;
    input.focus();
    input.select();
  });
}

function configureInlineResourcePopover(context) {
  const image = context.type === "image";
  const noun = image ? "图片" : "链接";
  elements.linkPopover.classList.toggle("is-image", image);
  elements.linkPopover.setAttribute("aria-label", `编辑${noun}`);
  elements.resourceLabelIcon.className = image ? "fa-regular fa-image" : "fa-solid fa-font";
  elements.resourceUrlIcon.className = "fa-solid fa-link";
  elements.linkLabel.placeholder = image ? "图片说明（可选）" : "链接文字";
  elements.linkLabel.setAttribute("aria-label", image ? "图片说明" : "链接文字");
  elements.linkUrl.placeholder = image ? "图片地址" : "粘贴或输入链接";
  elements.linkUrl.setAttribute("aria-label", image ? "图片地址" : "链接地址");
  setInlineResourceActionLabel(elements.linkOpen, image ? "查看原图" : "打开链接");
  setInlineResourceActionLabel(elements.linkRemove, image ? "移除图片" : "移除链接");
  setInlineResourceActionLabel(elements.linkApply, image ? "应用图片" : "应用链接");
}

function setInlineResourceActionLabel(button, label) {
  button.title = label;
  button.setAttribute("aria-label", label);
}

function closeLinkPopover({ restoreFocus = false } = {}) {
  if (!state.linkPopoverOpen) return;
  const context = state.linkContext;
  state.linkPopoverOpen = false;
  state.linkContext = null;
  elements.linkPopover.hidden = true;
  clearLinkPopoverError();
  if (!restoreFocus || !state.editor || !context) return;
  state.editor.focus();
  if (context.type === "image") {
    state.editor.setCursor(imageReturnCursor(context, state.editor, context.to.ch));
    return;
  }
  const vim = state.editorMode === "vim" ? state.editor.state?.vim : null;
  if (vim && !vim.insertMode && !vim.visualMode) state.editor.setCursor(context.from);
  else state.editor.setSelection(context.from, context.to);
}

function handleLinkPopoverKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeLinkPopover({ restoreFocus: true });
    return;
  }
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  applyLinkPopover();
}

function handleLinkPopoverAction(action) {
  if (action === "apply") applyLinkPopover();
  if (action === "remove") removeLinkFromPopover();
  if (action === "open") openLinkFromPopover();
}

function applyLinkPopover() {
  const context = state.linkContext;
  const cm = state.editor;
  if (!context || !cm) return;
  const image = context.type === "image";
  const noun = image ? "图片" : "链接";
  const label = elements.linkLabel.value.trim();
  const url = image
    ? normalizeMarkdownImageUrl(elements.linkUrl.value)
    : normalizeMarkdownLinkUrl(elements.linkUrl.value);
  if (!image && !label) {
    showLinkPopoverError("请输入链接文字", elements.linkLabel);
    return;
  }
  if (!url) {
    showLinkPopoverError(`${noun}地址无效`, elements.linkUrl);
    return;
  }
  const markdown = image
    ? formatMarkdownImage(label, url, context.titleSuffix)
    : formatMarkdownLink(label, url, context.titleSuffix);
  if (!markdown || !linkContextStillValid(context)) {
    closeLinkPopover();
    setStatus(`${noun}位置已经发生变化，请重试`, true);
    return;
  }

  closeLinkPopover();
  cm.operation(() => {
    cm.replaceRange(markdown, context.from, context.to, image ? "+image-edit" : "+link-edit");
    cm.setCursor(image
      ? imageReturnCursor(context, cm, context.from.ch + markdown.length)
      : { line: context.from.line, ch: context.from.ch + markdown.length });
  });
  cm.focus();
  setStatus(image ? "已更新图片" : context.isNew ? "已插入链接" : "已更新链接");
}

function removeLinkFromPopover() {
  const context = state.linkContext;
  const cm = state.editor;
  if (!context || !cm || context.isNew || !linkContextStillValid(context)) return;
  const image = context.type === "image";
  const replacement = image ? "" : elements.linkLabel.value.trim() || context.label;
  const range = image ? imageRemovalRange(context, cm) : { from: context.from, to: context.to };
  closeLinkPopover();
  cm.operation(() => {
    cm.replaceRange(replacement, range.from, range.to, image ? "+image-edit" : "+link-edit");
    cm.setCursor({ line: range.from.line, ch: range.from.ch + replacement.length });
  });
  cm.focus();
  setStatus(image ? "已移除图片" : "已移除链接");
}

function openLinkFromPopover() {
  const image = state.linkContext?.type === "image";
  const noun = image ? "图片" : "链接";
  const url = image
    ? normalizeMarkdownImageUrl(elements.linkUrl.value)
    : normalizeMarkdownLinkUrl(elements.linkUrl.value);
  if (!url) {
    showLinkPopoverError(`${noun}地址无效`, elements.linkUrl);
    return;
  }
  let href = url;
  try {
    if (!/^(?:https?:|mailto:)/i.test(url)) href = new URL(url, window.location.href).href;
  } catch {
    showLinkPopoverError(`${noun}地址无效`, elements.linkUrl);
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function linkContextStillValid(context) {
  const line = state.editor?.getLine(context.from.line);
  if (typeof line !== "string" || context.from.line !== context.to.line || context.to.ch > line.length) return false;
  if (context.isNew) return true;
  const parsed = context.type === "image"
    ? findMarkdownImageAt(line, context.from.ch)
    : findMarkdownLinkAt(line, context.from.ch);
  return Boolean(parsed && parsed.from === context.from.ch && parsed.to === context.to.ch);
}

function imageReturnCursor(context, cm, fallbackCh) {
  if (context.block && context.from.line < cm.lastLine()) return { line: context.from.line + 1, ch: 0 };
  return { line: context.from.line, ch: fallbackCh };
}

function imageRemovalRange(context, cm) {
  if (!context.block) return { from: context.from, to: context.to };
  const line = context.from.line;
  if (line < cm.lastLine()) {
    const nextLine = cm.getLine(line + 1);
    const toLine = !nextLine.trim() && line + 1 < cm.lastLine() ? line + 2 : line + 1;
    return { from: { line, ch: 0 }, to: { line: toLine, ch: 0 } };
  }
  if (line > cm.firstLine()) {
    const previous = line - 1;
    return {
      from: { line: previous, ch: cm.getLine(previous).length },
      to: context.to
    };
  }
  return { from: context.from, to: context.to };
}

function clearLinkPopoverError() {
  elements.linkError.hidden = true;
  elements.linkError.textContent = "";
  [elements.linkLabel, elements.linkUrl].forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
  if (state.linkPopoverOpen) window.requestAnimationFrame(positionLinkPopover);
}

function showLinkPopoverError(message, input) {
  clearLinkPopoverError();
  elements.linkError.textContent = message;
  elements.linkError.hidden = false;
  input.setAttribute("aria-invalid", "true");
  input.focus();
  window.requestAnimationFrame(positionLinkPopover);
}

function positionLinkPopover() {
  if (!state.linkPopoverOpen || !state.editor || !state.linkContext) return;
  const popover = elements.linkPopover;
  const start = state.linkContext.anchor || state.editor.charCoords(state.linkContext.from, "window");
  const end = state.linkContext.anchor || state.editor.charCoords(state.linkContext.to, "window");
  const width = popover.offsetWidth || 392;
  const height = popover.offsetHeight || 90;
  const center = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2;
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, center - width / 2));
  const navbarBottom = document.querySelector(".navbar-container")?.getBoundingClientRect().bottom || 0;
  const minY = Math.max(8, navbarBottom + 8);
  const below = Math.max(start.bottom, end.bottom) + 9;
  const above = Math.min(start.top, end.top) - height - 9;
  const y = below + height <= window.innerHeight - 8 ? below : Math.max(minY, above);
  positionFloatingElement(popover, x, y);
}

function applyHeadingCommand(cm, level) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const lastLine = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
  for (let lineNumber = lastLine; lineNumber >= from.line; lineNumber -= 1) {
    const line = cm.getLine(lineNumber);
    const cleaned = stripMarkdownBlockPrefix(line);
    const indent = /^\s*/.exec(cleaned)?.[0] || "";
    const content = cleaned.slice(indent.length);
    const next = `${indent}${level ? `${"#".repeat(level)} ` : ""}${content}`;
    cm.replaceRange(next, { line: lineNumber, ch: 0 }, { line: lineNumber, ch: line.length }, "+format");
  }
}

function applyParagraphCommand(cm) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const lastLine = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
  for (let lineNumber = lastLine; lineNumber >= from.line; lineNumber -= 1) {
    const line = cm.getLine(lineNumber);
    const next = stripMarkdownBlockPrefix(line);
    cm.replaceRange(next, { line: lineNumber, ch: 0 }, { line: lineNumber, ch: line.length }, "+format");
  }
}

function applyBlockCommand(command, cm = state.editor) {
  if (!cm || !requireOwnerAccess()) return;
  if (state.slashMenuOpen) closeSlashMenu();
  toggleBlockMenu(false);
  if (command === "image") {
    elements.imagePicker.click();
    return;
  }

  cm.operation(() => {
    if (command.startsWith("heading-")) {
      applyHeadingCommand(cm, Number(command.slice(-1)));
    } else if (command === "paragraph") {
      applyParagraphCommand(cm);
    } else if (["bullet-list", "ordered-list", "task-list", "quote"].includes(command)) {
      applyLinePrefixCommand(cm, command);
    } else if (command === "code-block") {
      insertCodeBlock(cm);
    } else if (command === "mermaid") {
      insertMermaidBlock(cm);
    } else if (command === "math-block") {
      insertMathBlock(cm);
    } else if (command === "table") {
      insertTableBlock(cm);
    } else if (command === "footnote") {
      insertFootnote(cm);
    } else if (command === "horizontal-rule") {
      const template = markdownBlockTemplate("horizontal-rule");
      insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
    }
  });
  cm.focus();
}

function toggleBlockMenu(force) {
  const open = typeof force === "boolean" ? force : !state.blockMenuOpen;
  if (open && state.linkPopoverOpen) closeLinkPopover();
  state.blockMenuOpen = Boolean(open && getSelectedNote() && !state.busy);
  elements.blockMenu.hidden = !state.blockMenuOpen;
  elements.blockToggle.classList.toggle("is-active", state.blockMenuOpen);
  elements.blockToggle.setAttribute("aria-expanded", state.blockMenuOpen ? "true" : "false");
  if (state.blockMenuOpen) positionBlockMenu();
}

function positionBlockMenu() {
  if (!state.blockMenuOpen) return;
  const anchor = elements.blockToggle.getBoundingClientRect();
  const menu = elements.blockMenu;
  const width = menu.offsetWidth || 300;
  const height = menu.offsetHeight || 224;
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left));
  const navbarBottom = document.querySelector(".navbar-container")?.getBoundingClientRect().bottom || 0;
  const minY = Math.max(8, navbarBottom + 8);
  const maxY = Math.max(minY, window.innerHeight - height - 8);
  const below = anchor.bottom + 8;
  const above = anchor.top - height - 8;
  const y = below <= maxY + 8 ? Math.min(below, maxY) : Math.max(minY, above);
  positionFloatingElement(menu, x, y);
}

function getSlashCommandCatalog() {
  return [...elements.blockMenu.querySelectorAll("[data-block-command]")].map((button) => {
    const command = button.dataset.blockCommand;
    const label = button.querySelector("span")?.textContent?.trim() || command;
    return {
      command,
      label,
      markup: button.innerHTML,
      search: `${label} ${SLASH_COMMAND_KEYWORDS[command] || ""}`
    };
  });
}

function getSlashContext(cm = state.editor) {
  if (!cm || cm.somethingSelected?.()) return null;
  const cursor = cm.getCursor();
  const parsed = parseMarkdownSlashContext(cm.getLine(cursor.line), cursor.ch);
  if (!parsed) return null;
  const tokenType = cm.getTokenTypeAt?.({ line: cursor.line, ch: Math.max(parsed.fromCh + 1, cursor.ch) }) || "";
  if (/\b(?:comment|string)\b/.test(tokenType)) return null;
  return {
    line: cursor.line,
    from: { line: cursor.line, ch: parsed.fromCh },
    to: { line: cursor.line, ch: parsed.toCh },
    query: parsed.query
  };
}

function syncSlashMenuFromEditor({ allowOpen = false } = {}) {
  const context = getSlashContext();
  if (!context) {
    if (state.slashMenuOpen) closeSlashMenu();
    return;
  }
  if (!state.slashMenuOpen && !allowOpen) return;

  const queryChanged = context.query !== state.slashContext?.query;
  state.slashContext = context;
  const query = normalizeSlashQuery(context.query);
  state.slashCommands = getSlashCommandCatalog().filter((item) => (
    !query || normalizeSlashQuery(item.search).includes(query)
  ));
  if (queryChanged || state.slashSelectedIndex >= state.slashCommands.length) {
    state.slashSelectedIndex = 0;
  }
  if (!state.slashMenuOpen) openSlashMenu();
  renderSlashMenu();
  positionSlashMenu();
}

function isSlashTriggerChange(change) {
  const inserted = Array.isArray(change?.text) ? change.text.join("\n") : "";
  return inserted === "/" && ["+input", "paste"].includes(change?.origin);
}

function normalizeSlashQuery(value) {
  return String(value || "").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function openSlashMenu() {
  if (!state.editor || state.slashMenuOpen) return;
  if (state.blockMenuOpen) toggleBlockMenu(false);
  if (state.linkPopoverOpen) closeLinkPopover();
  state.slashMenuOpen = true;
  elements.slashMenu.hidden = false;
  const input = state.editor.getInputField?.();
  input?.setAttribute("aria-haspopup", "listbox");
  input?.setAttribute("aria-controls", elements.slashMenu.id);
  input?.setAttribute("aria-expanded", "true");
  state.slashKeyMap = {
    name: "tomfng-slash-menu",
    Up: () => moveSlashSelection(-1),
    Down: () => moveSlashSelection(1),
    Tab: () => moveSlashSelection(1),
    "Shift-Tab": () => moveSlashSelection(-1),
    Enter: () => executeSlashCommand() ? undefined : window.CodeMirror.Pass,
    Esc: () => {
      const passToVim = state.editorMode === "vim";
      closeSlashMenu();
      return passToVim ? window.CodeMirror.Pass : undefined;
    }
  };
  state.editor.addKeyMap(state.slashKeyMap);
}

function closeSlashMenu() {
  if (state.slashKeyMap && state.editor) state.editor.removeKeyMap(state.slashKeyMap);
  state.slashKeyMap = null;
  state.slashMenuOpen = false;
  state.slashContext = null;
  state.slashCommands = [];
  state.slashSelectedIndex = 0;
  elements.slashMenu.hidden = true;
  elements.slashMenu.removeAttribute("aria-activedescendant");
  elements.slashMenu.replaceChildren();
  const input = state.editor?.getInputField?.();
  input?.setAttribute("aria-expanded", "false");
  input?.removeAttribute("aria-activedescendant");
}

function renderSlashMenu() {
  if (!state.slashMenuOpen) return;
  if (!state.slashCommands.length) {
    elements.slashMenu.innerHTML = '<div class="editor-slash-empty">没有匹配的内容</div>';
    elements.slashMenu.removeAttribute("aria-activedescendant");
    state.editor?.getInputField?.()?.removeAttribute("aria-activedescendant");
    return;
  }
  elements.slashMenu.innerHTML = state.slashCommands.map((item, index) => {
    const active = index === state.slashSelectedIndex;
    return `<button id="slash-command-${item.command}" type="button" role="option" aria-selected="${active}" class="${active ? "is-active" : ""}" data-slash-command="${item.command}" data-slash-index="${index}">${item.markup}</button>`;
  }).join("");
  setSlashSelection(state.slashSelectedIndex);
}

function setSlashSelection(index, scroll = true) {
  if (!state.slashCommands.length) return;
  const length = state.slashCommands.length;
  state.slashSelectedIndex = ((Math.floor(index) % length) + length) % length;
  let active = null;
  elements.slashMenu.querySelectorAll("[data-slash-index]").forEach((button) => {
    const selected = Number(button.dataset.slashIndex) === state.slashSelectedIndex;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
    if (selected) active = button;
  });
  if (!active) return;
  elements.slashMenu.setAttribute("aria-activedescendant", active.id);
  state.editor?.getInputField?.()?.setAttribute("aria-activedescendant", active.id);
  if (scroll) active.scrollIntoView({ block: "nearest" });
}

function moveSlashSelection(delta) {
  if (!state.slashMenuOpen || !state.slashCommands.length) return window.CodeMirror.Pass;
  setSlashSelection(state.slashSelectedIndex + delta);
  return undefined;
}

function executeSlashCommand(command = "") {
  const cm = state.editor;
  const context = getSlashContext(cm);
  const selected = command || state.slashCommands[state.slashSelectedIndex]?.command;
  if (!cm || !context || !selected) {
    closeSlashMenu();
    return false;
  }
  closeSlashMenu();
  cm.operation(() => {
    cm.replaceRange("", context.from, context.to, "+slash-command");
    cm.setCursor(context.from);
  });
  applyBlockCommand(selected, cm);
  return true;
}

function positionSlashMenu() {
  if (!state.slashMenuOpen || !state.editor) return;
  const cursor = state.editor.cursorCoords(state.editor.getCursor(), "window");
  const menu = elements.slashMenu;
  const width = menu.offsetWidth || 304;
  const height = menu.offsetHeight || 320;
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, cursor.left));
  const below = cursor.bottom + 9;
  const y = below + height <= window.innerHeight - 8
    ? below
    : Math.max(8, cursor.top - height - 9);
  positionFloatingElement(menu, x, y);
}

function positionFloatingElement(element, viewportX, viewportY) {
  const frame = element.closest(".main-content-body");
  const style = frame ? window.getComputedStyle(frame) : null;
  const contained = style && (
    style.transform !== "none"
    || style.filter !== "none"
    || style.perspective !== "none"
    || /(?:paint|layout|strict|content)/.test(style.contain)
    || /transform|filter|perspective/.test(style.willChange)
  );
  const frameBox = contained ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  const x = viewportX - frameBox.left;
  const y = viewportY - frameBox.top;
  element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function blockShortcut(command, respectVimNormal) {
  return (cm) => {
    const vim = state.editorMode === "vim" ? cm.state?.vim : null;
    if (respectVimNormal && vim && !vim.insertMode && !vim.visualMode) return window.CodeMirror.Pass;
    applyBlockCommand(command, cm);
    return undefined;
  };
}

function applyLinePrefixCommand(cm, command) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const lastLine = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
  const lines = [];
  for (let lineNumber = from.line; lineNumber <= lastLine; lineNumber += 1) {
    lines.push({ lineNumber, text: cm.getLine(lineNumber) });
  }
  const transformed = transformMarkdownBlockLines(lines.map((item) => item.text), command);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const item = lines[index];
    const next = transformed[index];
    if (next === item.text) continue;
    cm.replaceRange(next, { line: item.lineNumber, ch: 0 }, { line: item.lineNumber, ch: item.text.length }, "+format");
  }
}

function insertCodeBlock(cm) {
  const template = markdownBlockTemplate("code-block", cm.getSelection());
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
}

function insertMermaidBlock(cm) {
  const template = markdownBlockTemplate("mermaid", cm.getSelection());
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
}

function insertMathBlock(cm) {
  const template = markdownBlockTemplate("math-block", cm.getSelection());
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
}

function insertTableBlock(cm) {
  const template = markdownBlockTemplate("table");
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
}

function insertFootnote(cm) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const template = markdownFootnoteTemplate(cm.getValue(), cm.getRange(from, to));
  cm.replaceRange(template.reference, from, to, "+footnote");
  const value = cm.getValue();
  const prefix = value.endsWith("\n\n") ? "" : value.endsWith("\n") ? "\n" : "\n\n";
  const startIndex = value.length + prefix.length;
  const end = { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length };
  cm.replaceRange(`${prefix}${template.definition}`, end, end, "+footnote");
  cm.setSelection(
    cm.posFromIndex(startIndex + template.selectionStart),
    cm.posFromIndex(startIndex + template.selectionEnd)
  );
}

function insertStandaloneBlock(cm, body, selectionStart = body.length, selectionEnd = selectionStart) {
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const before = cm.getRange({ line: from.line, ch: 0 }, from);
  const after = cm.getRange(to, { line: to.line, ch: cm.getLine(to.line).length });
  const prefix = before.trim() ? "\n\n" : "";
  const suffix = after.trim() ? "\n\n" : "\n";
  const startIndex = cm.indexFromPos(from);
  cm.replaceRange(`${prefix}${body}${suffix}`, from, to, "+format");
  cm.setSelection(
    cm.posFromIndex(startIndex + prefix.length + selectionStart),
    cm.posFromIndex(startIndex + prefix.length + selectionEnd)
  );
}

function scheduleSelectionToolbar() {
  window.cancelAnimationFrame(state.selectionToolbarFrame);
  state.selectionToolbarFrame = null;
  if (state.selectionToolbarTimer) {
    window.clearTimeout(state.selectionToolbarTimer);
    state.selectionToolbarTimer = null;
  }

  const cm = state.editor;
  if (!cm?.hasFocus?.() || cm.somethingSelected?.() !== true) {
    hideSelectionToolbar();
    return;
  }

  // Typora-like: wait until selection settles so the bubble does not flicker while dragging.
  state.selectionToolbarTimer = window.setTimeout(() => {
    state.selectionToolbarTimer = null;
    state.selectionToolbarFrame = window.requestAnimationFrame(syncSelectionToolbar);
  }, 180);
}

function syncSelectionToolbar() {
  state.selectionToolbarFrame = null;
  const cm = state.editor;
  if (!cm?.hasFocus?.() || cm.somethingSelected?.() !== true) {
    hideSelectionToolbar();
    return;
  }
  const selections = cm.listSelections();
  if (selections.length !== 1) {
    hideSelectionToolbar();
    return;
  }
  const from = cm.getCursor("from");
  const to = cm.getCursor("to");
  const start = cm.charCoords(from, "window");
  const end = cm.charCoords(to, "window");
  const toolbar = elements.selectionToolbar;
  toolbar.hidden = false;
  const width = toolbar.offsetWidth || 196;
  const height = toolbar.offsetHeight || 38;
  const center = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2;
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, center - width / 2));
  const y = Math.max(8, Math.min(start.top, end.top) - height - 10);
  positionFloatingElement(toolbar, x, y);
}

function hideSelectionToolbar() {
  if (state.selectionToolbarTimer) {
    window.clearTimeout(state.selectionToolbarTimer);
    state.selectionToolbarTimer = null;
  }
  window.cancelAnimationFrame(state.selectionToolbarFrame);
  state.selectionToolbarFrame = null;
  elements.selectionToolbar.hidden = true;
}

function scheduleTableToolbar() {
  window.cancelAnimationFrame(state.tableToolbarFrame);
  state.tableToolbarFrame = window.requestAnimationFrame(syncTableToolbar);
}

function syncTableToolbar() {
  state.tableToolbarFrame = null;
  const cm = state.editor;
  if (!cm?.hasFocus?.() || state.sourceMode || cm.somethingSelected?.()) {
    hideTableToolbar();
    return;
  }
  const cursor = cm.getCursor();
  const context = getMarkdownTableContext(cm.getValue().split("\n"), cursor);
  if (!context) {
    hideTableToolbar();
    return;
  }

  state.tableContext = context;
  const toolbar = elements.tableToolbar;
  toolbar.hidden = false;
  toolbar.querySelector('[data-table-action="delete-row"]').disabled = context.rowType !== "body";
  toolbar.querySelector('[data-table-action="delete-column"]').disabled = context.columnCount <= 1;
  toolbar.querySelectorAll('[data-table-action="align"]').forEach((button) => {
    const active = button.dataset.tableValue === context.alignment;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const tableStart = cm.charCoords({ line: context.fromLine, ch: 0 }, "window");
  const tableEnd = cm.charCoords({
    line: context.toLine,
    ch: cm.getLine(context.toLine).length
  }, "window");
  if (tableEnd.bottom < 0 || tableStart.top > window.innerHeight) {
    hideTableToolbar();
    return;
  }
  const width = toolbar.offsetWidth || 276;
  const height = toolbar.offsetHeight || 40;
  const headerBox = [...cm.getWrapperElement().querySelectorAll("pre.HyperMD-table-row-0")]
    .map((element) => element.getBoundingClientRect())
    .reduce((closest, box) => (
      !closest || Math.abs(box.top - tableStart.top) < Math.abs(closest.top - tableStart.top) ? box : closest
    ), null);
  const visualTable = headerBox || tableStart;
  const preferredX = Math.max(visualTable.left, visualTable.right - width);
  const x = Math.max(8, Math.min(window.innerWidth - width - 8, preferredX));
  const above = visualTable.top - height - 8;
  const y = above >= 8 ? above : Math.min(window.innerHeight - height - 8, tableEnd.bottom + 8);
  positionFloatingElement(toolbar, x, y);
}

function hideTableToolbar() {
  state.tableContext = null;
  elements.tableToolbar.hidden = true;
}

function applyTableAction(action, value = "") {
  const cm = state.editor;
  if (!cm || !requireOwnerAccess()) return;
  const result = editMarkdownTable(cm.getValue().split("\n"), cm.getCursor(), action, value);
  if (!result) return;

  cm.operation(() => {
    const from = { line: result.fromLine, ch: 0 };
    const to = { line: result.toLine, ch: cm.getLine(result.toLine).length };
    cm.replaceRange(result.lines.join("\n"), from, to, "+table-edit");
    cm.setCursor(result.cursor);
  });
  cm.focus();
  scheduleTableToolbar();
}

function toggleFocusWriting(force) {
  if (state.slashMenuOpen) closeSlashMenu();
  state.focusWriting = typeof force === "boolean" ? force : !state.focusWriting;
  root.classList.toggle("is-focus-writing", state.focusWriting);
  elements.toggleFocus.classList.toggle("is-active", state.focusWriting);
  elements.toggleFocus.setAttribute("aria-pressed", state.focusWriting ? "true" : "false");
  elements.toggleFocus.querySelector("i").className = state.focusWriting ? "fa-solid fa-compress" : "fa-solid fa-expand";
  state.editor?.refresh?.();
  state.editor?.focus?.();
  if (state.focusWriting && state.typewriterMode) scheduleTypewriterCenter(true);
}

function toggleTypewriterMode(force) {
  state.typewriterMode = typeof force === "boolean" ? force : !state.typewriterMode;
  localStorage.setItem(TYPEWRITER_KEY, state.typewriterMode ? "1" : "0");
  syncTypewriterButton();
  state.editor?.focus?.();
  if (state.typewriterMode) scheduleTypewriterCenter(true);
}

function syncTypewriterButton() {
  if (!elements.toggleTypewriter) return;
  elements.toggleTypewriter.classList.toggle("is-active", state.typewriterMode);
  elements.toggleTypewriter.setAttribute("aria-pressed", state.typewriterMode ? "true" : "false");
}

function scheduleTypewriterCenter(force = false) {
  if (!state.typewriterMode || !state.editor) return;
  window.cancelAnimationFrame(state.typewriterFrame);
  state.typewriterFrame = window.requestAnimationFrame(() => centerActiveLine(force));
}

function centerActiveLine(force) {
  state.typewriterFrame = null;
  if (!state.typewriterMode || !state.editor?.hasFocus?.()) return;
  const cursor = state.editor.charCoords(state.editor.getCursor(), "window");
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const stickyHead = root.querySelector(".editor-head")?.getBoundingClientRect?.()?.height || 0;
  const target = viewportHeight * 0.42 + stickyHead * 0.25;
  const upper = target - viewportHeight * 0.12;
  const lower = target + viewportHeight * 0.14;
  if (!force && cursor.top >= upper && cursor.bottom <= lower) return;
  window.scrollBy({ top: cursor.top - target, left: 0, behavior: force ? "auto" : "smooth" });
}

function applySoftBreak(cm) {
  if (!cm || cm.listSelections().length !== 1 || cm.somethingSelected()) return false;
  if (state.sourceMode) return false;
  const cursor = cm.getCursor();
  const tokenType = cm.getTokenTypeAt?.(cursor) || "";
  if (/\b(?:comment|string|code)\b/.test(tokenType)) return false;
  if (getMarkdownTableContext(cm.getValue().split("\n"), cursor)) return false;
  const line = cm.getLine(cursor.line);
  // Lists / quotes / headings keep HyperMD indented soft-newline behavior.
  if (/^\s*(?:>\s*|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+)/.test(line)) return false;
  const edit = markdownSoftBreakInsert(line, cursor.ch);
  if (!edit) return false;
  cm.operation(() => {
    cm.replaceRange(
      edit.text,
      { line: cursor.line, ch: edit.from },
      { line: cursor.line, ch: edit.to },
      "+soft-break"
    );
    cm.setCursor({ line: cursor.line + 1, ch: edit.cursor });
  });
  return true;
}

function decorateEditorSoftBreaks(cm, lineHandle, element) {
  element?.querySelectorAll?.(".cm-gfm-hardbreak")?.forEach((node) => node.remove());
  if (state.sourceMode || !element) return;
  const lineNo = cm.getLineNumber?.(lineHandle);
  if (lineNo == null) return;
  const text = cm.getLine(lineNo);
  if (!lineHasGfmHardBreak(text)) return;
  const marker = document.createElement("span");
  marker.className = "cm-gfm-hardbreak";
  marker.setAttribute("aria-hidden", "true");
  marker.title = "GFM 硬换行";
  element.appendChild(marker);
}

function bindEditorImageResize() {
  const cm = state.editor;
  const wrapper = cm?.getWrapperElement?.();
  if (!wrapper) return;

  const scheduleSync = () => {
    window.cancelAnimationFrame(state.imageResizeFrame);
    state.imageResizeFrame = window.requestAnimationFrame(() => syncFoldedImageSizes(cm));
  };
  cm.on("update", scheduleSync);
  cm.on("changes", scheduleSync);
  scheduleSync();

  wrapper.addEventListener("pointerdown", (event) => {
    if (state.sourceMode || event.button !== 0) return;
    const handle = event.target.closest?.(".hmd-image-resize-handle");
    if (!handle) return;
    const host = handle.closest(".hmd-image-resize-host");
    const img = host?.querySelector("img.hmd-image");
    if (!img || img.classList.contains("hmd-image-loading")) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const context = imageContextFromElement(cm, img);
    if (!context) return;
    state.imageResizeSession = {
      img,
      host,
      startX,
      startWidth,
      context,
      liveWidth: Math.round(startWidth)
    };
    host.classList.add("is-resizing");
    handle.setPointerCapture?.(event.pointerId);
  }, true);

  wrapper.addEventListener("pointermove", (event) => {
    const session = state.imageResizeSession;
    if (!session) return;
    const delta = event.clientX - session.startX;
    const maxWidth = Math.min(1600, (cm.getWrapperElement()?.clientWidth || 720) - 24);
    const next = Math.max(80, Math.min(maxWidth, Math.round(session.startWidth + delta)));
    session.liveWidth = next;
    session.img.style.width = `${next}px`;
    session.img.style.maxWidth = "100%";
    session.img.style.height = "auto";
  }, true);

  const endResize = (event) => {
    const session = state.imageResizeSession;
    if (!session) return;
    state.imageResizeSession = null;
    session.host?.classList.remove("is-resizing");
    if (Math.abs(session.liveWidth - session.startWidth) < 4) {
      syncFoldedImageSizes(cm);
      return;
    }
    applyImageWidth(cm, session.context, session.liveWidth);
  };
  wrapper.addEventListener("pointerup", endResize, true);
  wrapper.addEventListener("pointercancel", endResize, true);
}

function imageContextFromElement(cm, img) {
  const rect = img.getBoundingClientRect();
  const position = cm.coordsChar({ left: rect.left + 4, top: rect.top + 4 }, "window");
  const parsed = findMarkdownImageAt(cm.getLine(position.line), position.ch)
    || findMarkdownImageAt(cm.getLine(position.line), Math.max(0, position.ch - 1));
  if (!parsed) return null;
  return imageContextFromParsed(position.line, parsed);
}

function applyImageWidth(cm, context, width) {
  if (!cm || !context || !linkContextStillValid(context)) return;
  const line = cm.getLine(context.from.line);
  const parsed = findMarkdownImageAt(line, context.from.ch);
  if (!parsed) return;
  const titleSuffix = formatMarkdownImageSize(parsed.titleSuffix || "", width);
  const next = formatMarkdownImage(parsed.label, parsed.url, titleSuffix);
  if (!next) return;
  cm.operation(() => {
    cm.replaceRange(next, context.from, context.to, "+image-resize");
  });
  window.requestAnimationFrame(() => syncFoldedImageSizes(cm));
}

function syncFoldedImageSizes(cm) {
  state.imageResizeFrame = null;
  if (!cm || state.sourceMode) return;
  const wrapper = cm.getWrapperElement?.();
  if (!wrapper) return;
  wrapper.querySelectorAll("img.hmd-image").forEach((img) => {
    if (img.classList.contains("hmd-image-loading")) return;
    ensureImageResizeHost(img);
    const context = imageContextFromElement(cm, img);
    if (!context) return;
    const line = cm.getLine(context.from.line);
    const parsed = findMarkdownImageAt(line, context.from.ch);
    if (!parsed) return;
    const { width } = parseMarkdownImageSize(parsed.titleSuffix || "");
    if (width) {
      img.style.width = `${width}px`;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.dataset.imageWidth = String(width);
    } else {
      img.style.width = "";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      delete img.dataset.imageWidth;
    }
  });
}

function ensureImageResizeHost(img) {
  if (img.closest(".hmd-image-resize-host")) return;
  const host = document.createElement("span");
  host.className = "hmd-image-resize-host";
  host.contentEditable = "false";
  img.parentNode?.insertBefore(host, img);
  host.appendChild(img);
  const handle = document.createElement("span");
  handle.className = "hmd-image-resize-handle";
  handle.title = "拖拽调整图片宽度";
  handle.setAttribute("aria-hidden", "true");
  host.appendChild(handle);
}

function bindFallbackImageTransfers() {
  fields.content.addEventListener("paste", (event) => {
    const files = imageFilesFromTransfer(event.clipboardData || window.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    insertImageUploads(files);
  });
  fields.content.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types?.includes?.("Files")) return;
    event.preventDefault();
    fields.content.classList.add("is-image-dragover");
  });
  fields.content.addEventListener("dragleave", () => fields.content.classList.remove("is-image-dragover"));
  fields.content.addEventListener("drop", (event) => {
    fields.content.classList.remove("is-image-dragover");
    const files = imageFilesFromTransfer(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    insertImageUploads(files);
  });
}

function imageFilesFromTransfer(transfer) {
  if (!transfer) return [];
  const itemFiles = [...(transfer.items || [])]
    .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  const files = itemFiles.length ? itemFiles : [...(transfer.files || [])]
    .filter((file) => String(file.type || "").startsWith("image/"));
  return files.filter((file, index) => files.indexOf(file) === index);
}

function insertImageUploads(files) {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note || !files.length) return;

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const task = {
    id,
    noteId: note.id,
    token: `<!--${IMAGE_UPLOAD_TOKEN}:${id}-->`,
    files: [...files],
    status: "new",
    current: 0,
    error: "",
    marker: null,
    widget: null,
    previewUrl: ""
  };
  task.previewUrl = task.files[0] && URL.createObjectURL ? URL.createObjectURL(task.files[0]) : "";
  state.imageUploads.set(task.id, task);

  if (state.editor) {
    const cm = state.editor;
    const from = cm.getCursor("from");
    const to = cm.getCursor("to");
    const before = cm.getRange({ line: from.line, ch: 0 }, from);
    const after = cm.getRange(to, { line: to.line, ch: cm.getLine(to.line).length });
    const prefix = before.trim() ? "\n\n" : "";
    const suffix = after.trim() ? "\n\n" : "\n";
    cm.replaceSelection(`${prefix}${task.token}${suffix}`, "end", "+image-upload");
    restorePendingImageUploads();
  } else {
    const start = fields.content.selectionStart || 0;
    const end = fields.content.selectionEnd || start;
    const value = fields.content.value;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n\n" : "\n";
    fields.content.setRangeText(`${prefix}${task.token}${suffix}`, start, end, "end");
    fields.content.dispatchEvent(new Event("input", { bubbles: true }));
  }

  enqueueImageUpload(task);
}

function enqueueImageUpload(task) {
  if (!task || task.status === "queued" || task.status === "uploading") return;
  task.status = "queued";
  task.error = "";
  updateImageUploadWidget(task);
  state.imageUploadQueue = state.imageUploadQueue
    .catch(() => undefined)
    .then(() => runImageUpload(task));
}

async function runImageUpload(task) {
  if (!state.imageUploads.has(task.id)) return;
  task.status = "uploading";
  task.current = 0;
  updateImageUploadWidget(task);

  try {
    const uploaded = [];
    for (let index = 0; index < task.files.length; index += 1) {
      if (!state.imageUploads.has(task.id)) return;
      const file = task.files[index];
      validateImageFile(file);
      task.current = index + 1;
      updateImageUploadWidget(task);
      const dataUrl = await fileToDataUrl(file);
      if (!state.imageUploads.has(task.id)) return;
      const result = await apiFetch("/api/assets", {
        method: "POST",
        body: JSON.stringify({ name: file.name || `image-${index + 1}`, dataUrl, noteId: task.noteId })
      });
      if (!state.imageUploads.has(task.id)) return;
      if (!isSafeImageUrl(result.url)) throw new Error("上传服务返回了无效的图片地址");
      uploaded.push(`![${markdownImageAlt(file.name)}](${result.url})`);
    }
    completeImageUpload(task, uploaded.join("\n\n"));
  } catch (error) {
    if (!state.imageUploads.has(task.id)) return;
    task.status = "error";
    task.error = error.message || "上传失败";
    updateImageUploadWidget(task);
    setStatus(`图片上传失败：${task.error}`, true);
  }
}

function validateImageFile(file) {
  if (!SUPPORTED_IMAGE_TYPES.has(String(file?.type || "").toLowerCase())) {
    throw new Error("只支持 PNG、JPEG、WebP 和 GIF 图片");
  }
  if (!file.size) throw new Error("图片内容为空");
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("单张图片不能超过 10 MB");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("无法读取图片")), { once: true });
    reader.readAsDataURL(file);
  });
}

function completeImageUpload(task, markdown) {
  const count = task.files.length;
  if (!replaceImageUploadToken(task, markdown)) {
    removeImageUploadTask(task);
    setStatus("图片已上传，但插入位置已被删除", true);
    return;
  }
  removeImageUploadTask(task, { keepContent: true });
  setStatus(`已插入 ${count} 张图片`);
}

function replaceImageUploadToken(task, replacement) {
  const note = state.data.notes.find((item) => item.id === task.noteId);
  if (!note) return false;

  if (state.selectedId === task.noteId) {
    if (state.editor) {
      const index = state.editor.getValue().indexOf(task.token);
      if (index < 0) return false;
      const from = state.editor.posFromIndex(index);
      const to = state.editor.posFromIndex(index + task.token.length);
      task.marker?.clear();
      task.marker = null;
      state.editor.replaceRange(replacement, from, to, "+image-upload");
      return true;
    }
    if (!fields.content.value.includes(task.token)) return false;
    fields.content.value = fields.content.value.replace(task.token, replacement);
    fields.content.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  if (!note.content.includes(task.token)) return false;
  note.content = note.content.replace(task.token, replacement);
  note.updatedAt = new Date().toISOString();
  note.localDirty = true;
  markDirty("图片已上传");
  renderList();
  return true;
}

function removeImageUploadTask(task, { keepContent = false } = {}) {
  if (!task) return;
  if (!keepContent) replaceImageUploadToken(task, "");
  task.marker?.clear();
  task.marker = null;
  state.imageUploads.delete(task.id);
  if (task.previewUrl && URL.revokeObjectURL) URL.revokeObjectURL(task.previewUrl);
}

function restorePendingImageUploads() {
  if (!state.editor || !state.selectedId) return;
  const value = state.editor.getValue();
  state.imageUploads.forEach((task) => {
    if (task.noteId !== state.selectedId) return;
    const existing = task.marker?.find?.();
    if (existing) return;
    const index = value.indexOf(task.token);
    if (index < 0) return;
    const from = state.editor.posFromIndex(index);
    const to = state.editor.posFromIndex(index + task.token.length);
    task.widget = createImageUploadWidget(task);
    task.marker = state.editor.markText(from, to, {
      replacedWith: task.widget,
      atomic: true,
      clearOnEnter: false,
      handleMouseEvents: true
    });
    updateImageUploadWidget(task);
  });
}

function createImageUploadWidget(task) {
  const widget = document.createElement("span");
  widget.className = "note-image-upload";
  widget.setAttribute("role", "status");
  widget.setAttribute("contenteditable", "false");
  widget.innerHTML = `
    <span class="note-image-upload-preview"></span>
    <span class="note-image-upload-copy">
      <strong data-upload-label>准备上传</strong>
      <small data-upload-detail></small>
    </span>
    <span class="note-image-upload-actions" data-upload-actions hidden>
      <button type="button" data-upload-retry title="重试" aria-label="重试上传"><i class="fa-solid fa-rotate"></i></button>
      <button type="button" data-upload-remove title="移除" aria-label="移除图片"><i class="fa-regular fa-trash-can"></i></button>
    </span>
  `;
  const preview = widget.querySelector(".note-image-upload-preview");
  if (task.previewUrl) {
    const image = document.createElement("img");
    image.src = task.previewUrl;
    image.alt = "";
    preview.appendChild(image);
  }
  widget.addEventListener("mousedown", (event) => event.stopPropagation());
  widget.querySelector("[data-upload-retry]").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    enqueueImageUpload(task);
  });
  widget.querySelector("[data-upload-remove]").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeImageUploadTask(task);
    setStatus("已移除待上传图片");
  });
  return widget;
}

function updateImageUploadWidget(task) {
  const widget = task.widget;
  if (!widget) return;
  const label = widget.querySelector("[data-upload-label]");
  const detail = widget.querySelector("[data-upload-detail]");
  const actions = widget.querySelector("[data-upload-actions]");
  widget.classList.toggle("is-error", task.status === "error");
  widget.classList.toggle("is-loading", task.status === "queued" || task.status === "uploading");
  if (task.status === "error") {
    label.textContent = "上传失败";
    detail.textContent = task.error;
    widget.title = task.error;
    actions.hidden = false;
  } else {
    label.textContent = task.status === "queued" ? "等待上传" : "正在上传";
    detail.textContent = `${Math.max(task.current, 1)}/${task.files.length} · ${task.files[0]?.name || "图片"}`;
    widget.removeAttribute("title");
    actions.hidden = true;
  }
  task.marker?.changed?.();
}

function markdownImageAlt(filename) {
  const base = String(filename || "图片").replace(/\.[^.]+$/, "").trim();
  const alt = /^(image|clipboard|blob)([-_ ]?\d+)?$/i.test(base) ? "图片" : (base || "图片");
  return alt.replace(/([\\\[\]])/g, "\\$1").replace(/[\r\n]+/g, " ");
}

function isSafeImageUrl(value) {
  return /^\/(?!\/)[^\s]+$/.test(String(value || "")) || /^https?:\/\/[^\s]+$/i.test(String(value || ""));
}

function hasPendingImageUploads(noteId = "") {
  return [...state.imageUploads.values()].some((task) => !noteId || task.noteId === noteId);
}

function clearStaleImageUploadTokens() {
  let count = 0;
  const pattern = new RegExp(`<!--${IMAGE_UPLOAD_TOKEN}:[^>]+-->`, "g");
  state.data.notes.forEach((note) => {
    const content = String(note.content || "");
    const matches = content.match(pattern);
    if (!matches?.length) return;
    count += matches.length;
    note.content = content.replace(pattern, "");
    note.localDirty = true;
    note.updatedAt = new Date().toISOString();
  });
  return count;
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

function triggerTypingPulse(_change) {
  // Typing bloom/pulse was too heavy for long-form writing; keep the hook as a no-op.
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
    updatedAt: now,
    localDirty: true
  });
  state.data.notes.unshift(note);
  state.selectedId = note.id;
  markDirty("新建页面");
  render();
  focusNewNoteTitle();
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
    remotePath: "",
    remoteSha: "",
    localDirty: true,
    createdAt: now,
    updatedAt: now
  });
  state.data.notes.unshift(copy);
  state.selectedId = copy.id;
  markDirty("已复制到本地");
  render();
  focusNewNoteTitle();
}

async function deleteSelectedNote() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note) return;
  const published = Boolean(note.remotePath);
  const message = published
    ? `确定删除《${note.title || "无标题"}》吗？文章会从博客中移除，本地未发布修改也会删除。`
    : `确定删除草稿《${note.title || "无标题"}》吗？此操作无法撤销。`;
  if (!window.confirm(message)) return;
  state.publishPollId += 1;

  if (published) {
    setBusy(true);
    setStatus("正在提交删除...");
    try {
      await apiFetch("/api/posts", {
        method: "DELETE",
        body: JSON.stringify({ path: note.remotePath, title: note.title })
      });
    } catch (error) {
      setStatus(`删除失败：${error.message}`, true);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  removeNoteLocally(note.id);
  state.selectedId = getVisibleNotes()[0]?.id || state.data.notes[0]?.id || null;
  markDirty(published ? "已提交删除，网站正在更新" : "已删除本地草稿");
  render();
}

function removeNoteLocally(noteId) {
  [...state.imageUploads.values()]
    .filter((task) => task.noteId === noteId)
    .forEach((task) => removeImageUploadTask(task));
  discardEditorSession(noteId);
  state.data.notes = state.data.notes.filter((item) => item.id !== noteId);
  state.selectedNoteIds.delete(noteId);
  if (state.selectedId === noteId) state.selectedId = null;
}

function focusNewNoteTitle() {
  if (fields.title.disabled) return;
  fields.title.focus();
  fields.title.select();
}

function discardEditorSession(noteId) {
  state.editorSessions.delete(noteId);
  delete state.editorView.notes[noteId];
  if (state.editorNoteId === noteId) state.editorNoteId = null;
  persistEditorView();
}

function updateSelectedFromFields() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note) return;
  const previous = {
    title: note.title,
    category: normalizeCategory(note.category),
    tags: note.tags.join("\u0000"),
    summary: note.summary,
    content: note.content
  };
  note.title = fields.title.value.trimStart();
  note.category = normalizeCategory(fields.category.value);
  note.tags = normalizeTags(fields.tags.value);
  const previousParentId = String(note.parentId || "");
  const nextParent = String(fields.parent?.value || "").trim();
  note.parentId = wouldCreateParentCycle(state.data.notes, note.id, nextParent) ? previousParentId : nextParent;
  if (fields.parent) fields.parent.value = note.parentId || "";
  note.slug = note.remotePath
    ? ensureNoteSlug({ ...note, slug: note.slug || fields.slug.value.trim() })
    : autoSlugForTitle(note.title);
  fields.slug.value = note.slug;
  note.summary = fields.summary.value.trimStart();
  note.content = getEditorValue();
  const changes = {
    title: previous.title !== note.title,
    category: previous.category !== note.category,
    tags: previous.tags !== note.tags.join("\u0000"),
    parentId: previousParentId !== String(note.parentId || ""),
    summary: previous.summary !== note.summary,
    content: previous.content !== note.content
  };
  if (!Object.values(changes).some(Boolean)) return;
  note.updatedAt = new Date().toISOString();
  note.localDirty = true;
  if (state.category !== "all" && state.category !== note.category) {
    state.category = note.category;
  }
  markDirty("正在编辑");
  validateSelected();
  updateEditorStats();
  state.previewDirty = true;
  scheduleSecondaryRender(note.id, {
    categories: changes.category,
    list: true,
    outline: changes.content,
    preview: changes.title || changes.summary || changes.content
  });
}

function scheduleSecondaryRender(noteId, work) {
  const queued = state.secondaryRenderWork?.noteId === noteId
    ? state.secondaryRenderWork
    : { noteId, categories: false, list: false, outline: false, preview: false };
  for (const key of ["categories", "list", "outline", "preview"]) {
    queued[key] = queued[key] || Boolean(work?.[key]);
  }
  state.secondaryRenderWork = queued;
  window.clearTimeout(state.secondaryRenderTimer);
  state.secondaryRenderTimer = window.setTimeout(() => {
    state.secondaryRenderTimer = null;
    const pending = state.secondaryRenderWork;
    state.secondaryRenderWork = null;
    if (!pending || pending.noteId !== state.selectedId) return;
    if (pending.categories) renderCategories();
    if (pending.list) renderList();
    if (pending.outline && state.sidebarMode === "outline") {
      renderOutline();
      renderSidebarMode();
    }
    if (pending.preview) {
      const note = state.data.notes.find((item) => item.id === pending.noteId);
      if (note) renderPreview(note);
    }
  }, 180);
}

function render() {
  if (elements.sortSelect) elements.sortSelect.value = state.sortBy || "updated";
  renderStatusFilters();
  renderCategories();
  renderTags();
  renderRecentStrip();
  renderSearchResults();
  renderBatchBar();
  renderList();
  renderEditor();
  renderOutline();
  renderSidebarMode();
  renderDirtyState();
  updateEditorStats();
}

function loadLibraryState() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistLibraryState() {
  state.library = normalizeLibraryState(state.library);
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(state.library));
  } catch {
    // Library prefs are convenience-only.
  }
}

function rememberOpenedNote(noteId) {
  if (!noteId) return;
  state.library = touchRecent(state.library, noteId);
  persistLibraryState();
}

function togglePinned(noteId) {
  state.library = normalizeLibraryState({
    ...state.library,
    pinnedIds: toggleIdInList(state.library.pinnedIds, noteId)
  });
  persistLibraryState();
  renderList();
  renderRecentStrip();
}

function toggleFavorite(noteId) {
  state.library = normalizeLibraryState({
    ...state.library,
    favoriteIds: toggleIdInList(state.library.favoriteIds, noteId)
  });
  persistLibraryState();
  renderList();
  renderRecentStrip();
}

function renderRecentStrip() {
  if (!elements.recentStrip) return;
  const ids = state.library.recentIds || [];
  const notes = ids
    .map((id) => state.data.notes.find((note) => note.id === id))
    .filter(Boolean)
    .slice(0, 8);
  if (!notes.length || state.sidebarMode === "outline") {
    elements.recentStrip.hidden = true;
    elements.recentStrip.innerHTML = "";
    return;
  }
  elements.recentStrip.hidden = false;
  elements.recentStrip.innerHTML = [
    '<span class="admin-recent-label">最近</span>',
    ...notes.map((note) => (
      `<button type="button" class="admin-recent-chip${note.id === state.selectedId ? " is-active" : ""}" data-id="${escapeHtml(note.id)}">${escapeHtml(note.title || "无标题")}</button>`
    ))
  ].join("");
  elements.recentStrip.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      rememberOpenedNote(state.selectedId);
      render();
    });
  });
}

function renderSearchResults() {
  if (!elements.searchResults) return;
  const query = state.noteQuery.trim();
  if (!query || state.sidebarMode === "outline") {
    elements.searchResults.hidden = true;
    elements.searchResults.innerHTML = "";
    return;
  }
  const hits = searchNotesWithSnippets(getVisibleNotes(), query, { limit: 12 });
  elements.searchResults.hidden = false;
  if (!hits.length) {
    elements.searchResults.innerHTML = `<div class="admin-search-empty">无匹配结果</div>`;
    return;
  }
  elements.searchResults.innerHTML = hits.map((hit) => {
    const marked = escapeHtml(hit.snippet).replace(
      new RegExp(`(${query.trim().split(/\s+/).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig"),
      "<mark>$1</mark>"
    );
    return `
      <button type="button" class="admin-search-hit" data-id="${escapeHtml(hit.id)}">
        <span class="admin-search-hit-title">${escapeHtml(hit.title)} <span class="state-pill state-${hit.status === "dirty" ? "pending" : hit.status}">${hit.status === "dirty" ? "有修改" : hit.status === "published" ? "已发布" : "草稿"}</span></span>
        <span class="admin-search-hit-snippet">${marked}</span>
      </button>
    `;
  }).join("");
  elements.searchResults.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      rememberOpenedNote(state.selectedId);
      render();
      state.editor?.focus?.();
    });
  });
}

function getCategories() {
  return [...new Set(state.data.notes.map((note) => normalizeCategory(note.category)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getTags() {
  const tags = new Set();
  state.data.notes.forEach((note) => {
    normalizeTags(note.tags).forEach((tag) => tags.add(tag));
  });
  return [...tags].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getVisibleNotes() {
  const filtered = selectVisibleNotes(state.data.notes, {
    category: state.category,
    statusFilter: state.statusFilter,
    tag: state.tag,
    query: state.noteQuery,
    sortBy: state.sortBy
  });
  const ordered = orderNotesWithPinsAndTree(filtered, state.library, state.sortBy);
  state.noteDepthById = ordered.depthById;
  return ordered.notes;
}

function ensureSelectedVisible() {
  const visible = getVisibleNotes();
  if (visible.some((note) => note.id === state.selectedId)) return;
  state.selectedId = visible[0]?.id || null;
}

function pruneBatchSelection() {
  if (!state.batchMode) return;
  const visible = new Set(getVisibleNotes().map((note) => note.id));
  state.selectedNoteIds = new Set([...state.selectedNoteIds].filter((id) => visible.has(id)));
}

function setBatchMode(enabled) {
  state.batchMode = Boolean(enabled);
  if (!state.batchMode) state.selectedNoteIds = new Set();
  if (elements.batchToggle) {
    elements.batchToggle.classList.toggle("is-active", state.batchMode);
    elements.batchToggle.setAttribute("aria-pressed", state.batchMode ? "true" : "false");
  }
  root.classList.toggle("is-batch-mode", state.batchMode);
  renderBatchBar();
  renderList();
  renderSidebarMode();
}

function selectAllVisibleNotes() {
  if (!state.batchMode) setBatchMode(true);
  state.selectedNoteIds = new Set(getVisibleNotes().map((note) => note.id));
  renderBatchBar();
  renderList();
}

function toggleNoteSelection(noteId) {
  if (!noteId) return;
  if (state.selectedNoteIds.has(noteId)) state.selectedNoteIds.delete(noteId);
  else state.selectedNoteIds.add(noteId);
  renderBatchBar();
  renderList();
}

function renderBatchBar() {
  if (!elements.batchBar) return;
  const count = state.selectedNoteIds.size;
  elements.batchBar.hidden = !state.batchMode || state.sidebarMode === "outline";
  if (elements.batchCount) elements.batchCount.textContent = `已选 ${count}`;
  if (elements.batchCategory) elements.batchCategory.disabled = state.busy || count === 0;
  if (elements.batchDelete) elements.batchDelete.disabled = state.busy || count === 0;
}

function applyListFilterChange() {
  pruneBatchSelection();
  ensureSelectedVisible();
  persistEditorView();
  render();
}

function renderStatusFilters() {
  if (!elements.statusStrip) return;
  const options = [
    ["all", "全部"],
    ["draft", "草稿"],
    ["published", "已发布"],
    ["dirty", "有修改"]
  ];
  if (!options.some(([value]) => value === state.statusFilter)) state.statusFilter = "all";
  elements.statusStrip.innerHTML = options.map(([value, label]) => {
    const active = value === state.statusFilter ? " is-active" : "";
    return `<button class="category-filter${active}" type="button" data-status="${value}">${label}</button>`;
  }).join("");
  elements.statusStrip.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.statusFilter = button.dataset.status || "all";
      applyListFilterChange();
    });
  });
}

function renderCategories() {
  const categories = getCategories();
  if (state.category !== "all" && !categories.includes(state.category)) {
    state.category = "all";
    persistEditorView();
  }
  const buttons = ["all", ...categories].map((category) => {
    const label = category === "all" ? "全部分类" : category;
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
      applyListFilterChange();
    });
  });
}

function renderTags() {
  if (!elements.tagStrip) return;
  const tags = getTags();
  if (state.tag !== "all" && !tags.includes(state.tag)) {
    state.tag = "all";
    persistEditorView();
  }
  const buttons = ["all", ...tags].map((tag) => {
    const label = tag === "all" ? "全部标签" : tag;
    const active = tag === state.tag ? " is-active" : "";
    return `<button class="tag-filter${active}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(label)}</button>`;
  });
  elements.tagStrip.innerHTML = buttons.join("");
  elements.tagStrip.hidden = tags.length === 0;
  elements.tagStrip.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tag = button.dataset.tag || "all";
      applyListFilterChange();
    });
  });
}

function noteStatusMeta(note) {
  const status = getNoteListStatus(note);
  if (status === "draft") {
    return {
      name: isRemoteDraftPath(note.remotePath) ? "远端草稿" : "草稿",
      className: "draft"
    };
  }
  if (status === "dirty") return { name: "有修改", className: "pending" };
  return { name: "已发布", className: "published" };
}

function renderList() {
  const visibleNotes = getVisibleNotes();
  elements.count.textContent = `${visibleNotes.length}`;
  if (!visibleNotes.length) {
    const searching = Boolean(state.noteQuery.trim());
    const filtered = state.data.notes.length > 0;
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>${searching ? "没有匹配页面" : filtered ? "没有符合条件的页面" : "没有页面"}</h2>
        <p>${searching ? "换个关键词继续查找。" : filtered ? "调整状态、分类或标签筛选。" : "点击新建，开始写第一条笔记。"}</p>
      </div>
    `;
    return;
  }

  const pinned = new Set(state.library.pinnedIds || []);
  const favorites = new Set(state.library.favoriteIds || []);
  elements.list.innerHTML = visibleNotes.map((note) => {
    const active = note.id === state.selectedId ? " is-active" : "";
    const checked = state.selectedNoteIds.has(note.id);
    const checkedClass = checked ? " is-checked" : "";
    const status = noteStatusMeta(note);
    const depth = state.noteDepthById.get(note.id) || 0;
    const cover = extractNoteCover(note.content, note.frontMatter);
    const liveUrl = publicNoteUrl(note, SITE_BASE);
    const checkbox = state.batchMode
      ? `<span class="note-row-check" aria-hidden="true">${checked ? "☑" : "☐"}</span>`
      : "";
    const coverHtml = cover
      ? `<span class="note-row-cover" style="background-image:url('${escapeHtml(cover)}')"></span>`
      : `<span class="note-row-cover is-empty"></span>`;
    const tags = normalizeTags(note.tags).slice(0, 3).join(" · ");
    return `
      <div class="note-row-wrap" style="--note-depth:${depth}">
        <button class="note-row${active}${checkedClass}${state.batchMode ? " is-batch" : ""}${depth ? " is-child" : ""}" type="button" data-id="${escapeHtml(note.id)}"${state.busy ? " disabled" : ""}>
          ${checkbox}
          ${coverHtml}
          <span class="note-row-body">
            <span class="note-row-title">
              <span>${pinned.has(note.id) ? "📌 " : ""}${favorites.has(note.id) ? "★ " : ""}${escapeHtml(note.title || "无标题")}</span>
              <span class="state-pill state-${status.className}">${status.name}</span>
            </span>
            <span class="note-row-meta">${escapeHtml(normalizeCategory(note.category))}${tags ? ` · ${escapeHtml(tags)}` : ""} · ${escapeHtml(formatRelativeTime(note.updatedAt))}</span>
            <span class="note-row-summary">${escapeHtml(note.summary || note.content.slice(0, 110) || "无摘要")}</span>
          </span>
        </button>
        <span class="note-row-actions">
          <button type="button" class="note-row-action" data-action="pin" data-id="${escapeHtml(note.id)}" title="置顶">${pinned.has(note.id) ? "取消置顶" : "置顶"}</button>
          <button type="button" class="note-row-action" data-action="fav" data-id="${escapeHtml(note.id)}" title="收藏">${favorites.has(note.id) ? "取消收藏" : "收藏"}</button>
          ${liveUrl ? `<a class="note-row-action" href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer">打开</a>` : ""}
        </span>
      </div>
    `;
  }).join("");

  elements.list.querySelectorAll(".note-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      const noteId = row.dataset.id;
      if (state.batchMode) {
        event.preventDefault();
        toggleNoteSelection(noteId);
        return;
      }
      state.selectedId = noteId;
      rememberOpenedNote(noteId);
      render();
      if (event.detail === 0) state.editor?.focus?.();
    });
  });
  elements.list.querySelectorAll("[data-action='pin']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      togglePinned(button.dataset.id);
    });
  });
  elements.list.querySelectorAll("[data-action='fav']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.id);
    });
  });
}

function setSidebarMode(mode) {
  state.sidebarMode = mode === "outline" ? "outline" : "pages";
  persistEditorView();
  renderOutline();
  renderSidebarMode();
  renderBatchBar();
}

function renderSidebarMode() {
  const outlineMode = state.sidebarMode === "outline";
  elements.sidebarTitle.textContent = outlineMode ? "大纲" : "页面";
  elements.pageActions.hidden = outlineMode;
  elements.noteSearchWrap.hidden = outlineMode;
  if (elements.filterStack) elements.filterStack.hidden = outlineMode;
  elements.categoryStrip.hidden = outlineMode;
  if (elements.statusStrip) elements.statusStrip.hidden = outlineMode;
  if (elements.tagStrip) elements.tagStrip.hidden = outlineMode || getTags().length === 0;
  if (elements.sortWrap) elements.sortWrap.hidden = outlineMode;
  if (elements.batchBar) elements.batchBar.hidden = outlineMode || !state.batchMode;
  elements.list.hidden = outlineMode;
  elements.outline.hidden = !outlineMode;
  elements.sidebarPages.classList.toggle("is-active", !outlineMode);
  elements.sidebarOutline.classList.toggle("is-active", outlineMode);
  elements.sidebarPages.setAttribute("aria-selected", outlineMode ? "false" : "true");
  elements.sidebarOutline.setAttribute("aria-selected", outlineMode ? "true" : "false");
  const note = getSelectedNote();
  const count = outlineMode ? extractMarkdownHeadings(note?.content || "").length : getVisibleNotes().length;
  elements.count.textContent = `${count}`;
}

async function batchDeleteNotes() {
  if (!requireOwnerAccess() || !state.batchMode) return;
  const ids = [...state.selectedNoteIds];
  const notes = state.data.notes.filter((note) => ids.includes(note.id));
  if (!notes.length) return;
  const publishedCount = notes.filter((note) => note.remotePath).length;
  const message = publishedCount
    ? `确定删除选中的 ${notes.length} 篇页面吗？其中 ${publishedCount} 篇已发布，会从博客移除。`
    : `确定删除选中的 ${notes.length} 篇草稿吗？此操作无法撤销。`;
  if (!window.confirm(message)) return;

  state.publishPollId += 1;
  setBusy(true);
  setStatus("正在批量删除...");
  let failed = 0;
  for (const note of notes) {
    if (!note.remotePath) {
      removeNoteLocally(note.id);
      continue;
    }
    try {
      await apiFetch("/api/posts", {
        method: "DELETE",
        body: JSON.stringify({ path: note.remotePath, title: note.title })
      });
      removeNoteLocally(note.id);
    } catch {
      failed += 1;
    }
  }
  setBusy(false);
  state.selectedNoteIds = new Set();
  ensureSelectedVisible();
  if (failed) markDirty(`已删除部分页面，${failed} 篇远端删除失败`);
  else markDirty(publishedCount ? "批量删除已提交，网站正在更新" : "已批量删除草稿");
  if (!state.selectedNoteIds.size) setBatchMode(false);
  else render();
}

function batchChangeCategory() {
  if (!requireOwnerAccess() || !state.batchMode) return;
  const ids = [...state.selectedNoteIds];
  const notes = state.data.notes.filter((note) => ids.includes(note.id));
  if (!notes.length) return;
  const next = window.prompt("批量改到分类：", notes[0].category || "未分类");
  if (next == null) return;
  const category = normalizeCategory(next);
  const now = new Date().toISOString();
  notes.forEach((note) => {
    note.category = category;
    note.localDirty = true;
    note.updatedAt = now;
  });
  state.category = category;
  markDirty(`已将 ${notes.length} 篇改到「${category}」`);
  applyListFilterChange();
}

function renderOutline() {
  const note = getSelectedNote();
  const headings = extractMarkdownHeadings(note?.content || "");
  if (!headings.length) {
    elements.outline.innerHTML = `
      <div class="empty-state outline-empty">
        <h2>暂无大纲</h2>
      </div>
    `;
    return;
  }

  elements.outline.innerHTML = headings.map((heading) => `
    <button class="outline-row outline-level-${heading.level}" type="button" data-line="${heading.line}" title="${escapeHtml(heading.text)}">
      <span>${escapeHtml(heading.text)}</span>
    </button>
  `).join("");
  elements.outline.querySelectorAll(".outline-row").forEach((button) => {
    button.addEventListener("click", () => jumpToOutlineLine(Number(button.dataset.line)));
  });
  updateOutlineActiveState();
}

function jumpToOutlineLine(line) {
  if (!state.editor || !Number.isInteger(line)) return;
  const value = state.editor.getLine(line) || "";
  const marker = /^ {0,3}#{1,6}\s+/.exec(value);
  const position = { line, ch: marker?.[0].length || 0 };
  state.editor.setCursor(position);
  state.editor.scrollIntoView(position, 120);
  state.editor.focus();
  updateOutlineActiveState();
}

function updateOutlineActiveState() {
  if (state.sidebarMode !== "outline" || !state.editor) return;
  const cursorLine = state.editor.getCursor().line;
  let active = null;
  elements.outline.querySelectorAll(".outline-row").forEach((button) => {
    button.classList.remove("is-active");
    if (Number(button.dataset.line) <= cursorLine) active = button;
  });
  active?.classList.add("is-active");
}

function renderEditor() {
  const note = getSelectedNote();
  const switchedDocument = switchEditorDocument(note?.id || null);
  if (switchedDocument && state.slashMenuOpen) closeSlashMenu();
  if (switchedDocument && state.linkPopoverOpen) closeLinkPopover();
  const contentReloaded = Boolean(note && state.editor && state.editor.getValue() !== note.content);
  if (!switchedDocument && contentReloaded) captureEditorView();
  if (
    note && (
      switchedDocument
      || contentReloaded
      || state.previewNoteId !== note.id
      || elements.previewTitle.textContent !== (note.title || "无标题")
      || elements.previewSummary.textContent !== (note.summary || "")
    )
  ) state.previewDirty = true;
  const disabled = !note || state.busy;
  Object.values(fields).forEach((field) => {
    field.disabled = disabled;
  });
  fields.status.disabled = true;
  elements.duplicateNote.disabled = disabled;
  elements.deleteNote.disabled = disabled;
  if (elements.batchToggle) elements.batchToggle.disabled = state.busy;
  elements.toggleFocus.disabled = disabled;
  if (elements.toggleTypewriter) elements.toggleTypewriter.disabled = disabled;
  elements.toggleSource.disabled = disabled;
  elements.editorSearch.disabled = disabled;
  elements.blockToggle.disabled = disabled;

  if (!note) {
    if (state.blockMenuOpen) toggleBlockMenu(false);
    if (state.focusWriting) toggleFocusWriting(false);
    if (state.sourceMode) toggleSourceMode(false);
    fields.title.value = "";
    autoSizeTitleField();
    fields.slug.value = "";
    fields.category.value = "";
    fields.tags.value = "";
    fields.status.value = "draft";
    fields.summary.value = "";
    setEditorValue("", { force: switchedDocument });
    setEditorEnabled(false);
    elements.previewTitle.textContent = "未选择页面";
    elements.previewSummary.textContent = "";
    elements.previewContent.innerHTML = `
      <div class="empty-state">
        <h2>空白工作区</h2>
        <p>从左侧新建或选择一条笔记。</p>
      </div>
    `;
    state.previewDirty = false;
    state.previewNoteId = null;
    return;
  }

  fields.title.value = note.title;
  autoSizeTitleField();
  fields.slug.value = syncDraftSlug(note);
  fields.category.value = normalizeCategory(note.category);
  fields.tags.value = note.tags.join(", ");
  if (fields.parent) {
    const options = ['<option value="">无（根页面）</option>']
      .concat(
        state.data.notes
          .filter((item) => item.id !== note.id && !wouldCreateParentCycle(state.data.notes, note.id, item.id))
          .map((item) => (
            `<option value="${escapeHtml(item.id)}"${item.id === note.parentId ? " selected" : ""}>${escapeHtml(item.title || "无标题")}</option>`
          ))
      );
    fields.parent.innerHTML = options.join("");
    fields.parent.value = note.parentId || "";
  }
  const listStatus = getNoteListStatus(note);
  fields.status.value = listStatus === "draft" ? "draft" : "published";
  const statusLabel = noteStatusMeta(note).name;
  const statusHint = root.querySelector("#status-hint");
  if (statusHint) {
    statusHint.textContent = listStatus === "dirty"
      ? "已发布 · 本地有未同步修改（发布后恢复一致）"
      : listStatus === "published"
        ? "已发布 · 与线上一致"
        : "草稿 · 仅保存在本机";
  }
  fields.status.setAttribute("aria-label", `发布状态：${statusLabel}`);
  fields.summary.value = note.summary;
  setEditorValue(note.content, { force: switchedDocument });
  setEditorEnabled(!state.busy);
  if (switchedDocument || contentReloaded) restoreEditorSession(note);
  renderPreview(note);
  validateSelected();
}

function autoSizeTitleField() {
  if (!fields.title) return;
  fields.title.style.height = "auto";
  fields.title.style.height = `${Math.max(fields.title.scrollHeight, 40)}px`;
}

function renderPreview(note, { force = false } = {}) {
  elements.previewTitle.textContent = note.title || "无标题";
  elements.previewSummary.textContent = note.summary || "";
  if (!force && !elements.previewPanel.open) {
    state.previewDirty = true;
    state.previewNoteId = note.id;
    return;
  }
  if (!force && !state.previewDirty && state.previewNoteId === note.id) return;
  elements.previewContent.innerHTML = markdownToHtml(contentWithoutTitleHeading(note) || " ");
  window.TomfngMermaid?.renderAll(elements.previewContent);
  state.previewDirty = false;
  state.previewNoteId = note.id;
}

function getEditorValue() {
  return state.editor ? state.editor.getValue() : fields.content.value;
}

function setEditorValue(value, { force = false } = {}) {
  const nextValue = String(value || "");
  fields.content.value = nextValue;
  if (!state.editor) return;
  if (!force && state.editor.getValue() === nextValue) {
    restorePendingImageUploads();
    updateEditorStats();
    return;
  }
  state.syncingEditor = true;
  state.editor.setValue(nextValue);
  state.editor.clearHistory();
  state.syncingEditor = false;
  restorePendingImageUploads();
  updateEditorStats();
}

function switchEditorDocument(noteId) {
  const nextId = noteId || null;
  if (state.editorNoteId === nextId) return false;
  captureEditorSession(state.editorNoteId);
  state.editorNoteId = nextId;
  persistEditorView();
  return true;
}

function captureEditorSession(noteId = state.editorNoteId) {
  if (!state.editor || !noteId) return;
  const scroll = state.editor.getScrollInfo();
  const selections = cloneEditorSelections(state.editor.listSelections());
  const session = {
    value: state.editor.getValue(),
    history: state.editor.getHistory(),
    selections,
    scrollLeft: scroll.left,
    scrollTop: scroll.top,
    pageScrollY: window.scrollY
  };
  state.editorSessions.delete(noteId);
  state.editorSessions.set(noteId, session);
  while (state.editorSessions.size > 20) {
    state.editorSessions.delete(state.editorSessions.keys().next().value);
  }
  rememberEditorView(noteId, selections[0]?.head, scroll);
}

function restoreEditorSession(note) {
  if (!state.editor || !note) return;
  const session = state.editorSessions.get(note.id);
  const canRestoreHistory = session?.value === note.content;
  const persisted = state.editorView.notes[note.id];
  const selections = canRestoreHistory
    ? session.selections
    : persisted?.cursor
      ? [{ anchor: persisted.cursor, head: persisted.cursor }]
      : null;
  const scrollLeft = canRestoreHistory ? session.scrollLeft : persisted?.scrollLeft;
  const scrollTop = canRestoreHistory ? session.scrollTop : persisted?.scrollTop;
  const pageScrollY = canRestoreHistory ? session.pageScrollY : persisted?.pageScrollY;

  if (canRestoreHistory) {
    try {
      state.editor.setHistory(session.history);
    } catch {
      state.editor.clearHistory();
    }
  }
  if (selections?.length) {
    state.editor.setSelections(selections.map((range) => ({
      anchor: clipEditorPosition(state.editor, range.anchor),
      head: clipEditorPosition(state.editor, range.head)
    })));
  }
  window.requestAnimationFrame?.(() => {
    if (!state.editor || state.editorNoteId !== note.id) return;
    state.editor.refresh();
    state.editor.scrollTo(Number(scrollLeft) || 0, Number(scrollTop) || 0);
    syncEditorCursorStyle();
    window.requestAnimationFrame?.(() => {
      if (state.editorNoteId !== note.id) return;
      window.scrollTo(window.scrollX, Number(pageScrollY) || 0);
    });
  });
}

function cloneEditorSelections(selections) {
  return Array.from(selections || [], (range) => ({
    anchor: { line: range.anchor.line, ch: range.anchor.ch },
    head: { line: range.head.line, ch: range.head.ch }
  }));
}

function clipEditorPosition(cm, position) {
  const firstLine = cm.firstLine();
  const lastLine = cm.lastLine();
  const line = Math.min(lastLine, Math.max(firstLine, Math.floor(Number(position?.line) || 0)));
  const ch = Math.min(cm.getLine(line).length, Math.max(0, Math.floor(Number(position?.ch) || 0)));
  return { line, ch };
}

function scheduleEditorViewSave() {
  window.clearTimeout(state.editorViewTimer);
  state.editorViewTimer = window.setTimeout(() => {
    state.editorViewTimer = null;
    captureEditorView();
  }, 300);
}

function captureEditorView() {
  if (!state.editor || !state.editorNoteId) {
    persistEditorView();
    return;
  }
  rememberEditorView(state.editorNoteId, state.editor.getCursor(), state.editor.getScrollInfo());
}

function rememberEditorView(noteId, cursor, scroll) {
  if (!noteId) return;
  delete state.editorView.notes[noteId];
  state.editorView.notes[noteId] = {
    cursor: {
      line: Math.max(0, Math.floor(Number(cursor?.line) || 0)),
      ch: Math.max(0, Math.floor(Number(cursor?.ch) || 0))
    },
    scrollTop: Math.max(0, Number(scroll?.top ?? scroll?.scrollTop) || 0),
    scrollLeft: Math.max(0, Number(scroll?.left ?? scroll?.scrollLeft) || 0),
    pageScrollY: Math.max(0, Number(window.scrollY) || 0)
  };
  persistEditorView();
}

function persistEditorView() {
  state.editorView.selectedId = state.selectedId || "";
  state.editorView.category = state.category;
  state.editorView.statusFilter = state.statusFilter || "all";
  state.editorView.sortBy = state.sortBy || "updated";
  state.editorView.tag = state.tag || "all";
  state.editorView.sidebarMode = state.sidebarMode;
  state.editorView = normalizeEditorViewState(state.editorView);
  state.statusFilter = state.editorView.statusFilter;
  state.sortBy = state.editorView.sortBy;
  state.tag = state.editorView.tag;
  state.category = state.editorView.category;
  try {
    localStorage.setItem(EDITOR_VIEW_KEY, JSON.stringify(state.editorView));
  } catch {
    // Editor position is a convenience; note autosave remains independent.
  }
}

function flushEditorSession() {
  window.clearTimeout(state.editorViewTimer);
  state.editorViewTimer = null;
  captureEditorSession();
  persistEditorView();
  flushAutosave();
}

function setEditorEnabled(enabled) {
  if (!state.editor) return;
  state.editor.setOption("readOnly", enabled ? false : "nocursor");
  if (!enabled) {
    hideTableToolbar();
    closeLinkPopover();
  }
}

function toggleEditorMode() {
  if (!requireOwnerAccess()) return;
  if (state.slashMenuOpen) closeSlashMenu();
  if (state.linkPopoverOpen) closeLinkPopover();
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

function toggleSourceMode(force) {
  if (!requireOwnerAccess()) return;
  if (state.slashMenuOpen) closeSlashMenu();
  if (state.linkPopoverOpen) closeLinkPopover();
  state.sourceMode = typeof force === "boolean" ? force : !state.sourceMode;
  const cm = state.editor;
  if (cm) {
    const wrapper = cm.getWrapperElement?.();
    wrapper?.classList.toggle("note-source-mode", state.sourceMode);
    if (cm.getMode?.().name === "hypermd") {
      cm.operation(() => {
        cm.setOption("hmdHideToken", !state.sourceMode);
        cm.setOption("hmdFold", state.sourceMode ? false : getLiveFoldOptions());
        cm.setOption("hmdTableAlign", !state.sourceMode);
      });
    }
    cm.refresh();
    cm.focus();
  }
  scheduleTableToolbar();
  updateEditorStats();
}

function sourceModeShortcut(respectVimNormal) {
  return (cm) => {
    const vim = state.editorMode === "vim" ? cm.state?.vim : null;
    if (respectVimNormal && vim && !vim.insertMode && !vim.visualMode) return window.CodeMirror.Pass;
    toggleSourceMode();
    return undefined;
  };
}

function openPageSearch() {
  if (!requireOwnerAccess() || state.busy) return;
  if (state.slashMenuOpen) closeSlashMenu();
  if (state.linkPopoverOpen) closeLinkPopover();
  if (state.blockMenuOpen) toggleBlockMenu(false);
  if (state.sidebarMode !== "pages") setSidebarMode("pages");
  elements.noteSearch.focus();
  elements.noteSearch.select();
}

function pageSearchShortcut(respectVimNormal) {
  return (cm) => {
    const vim = state.editorMode === "vim" ? cm.state?.vim : null;
    if (respectVimNormal && vim && !vim.insertMode && !vim.visualMode) return window.CodeMirror.Pass;
    openPageSearch();
    return undefined;
  };
}

function handleNoteSearchKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (state.noteQuery) {
      state.noteQuery = "";
      elements.noteSearch.value = "";
      renderList();
      renderSidebarMode();
    } else {
      state.editor?.focus?.();
    }
    return;
  }
  if (event.key === "ArrowDown") {
    const first = elements.list.querySelector(".note-row");
    if (!first) return;
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.key !== "Enter") return;
  const first = getVisibleNotes()[0];
  if (!first) return;
  event.preventDefault();
  state.selectedId = first.id;
  persistEditorView();
  render();
  state.editor?.focus?.();
}

function handleNoteListKeydown(event) {
  const current = event.target.closest?.(".note-row");
  if (!current) return;
  if (event.key === " " || event.code === "Space") {
    if (!state.batchMode) return;
    event.preventDefault();
    toggleNoteSelection(current.dataset.id);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.batchMode) {
      toggleNoteSelection(current.dataset.id);
      return;
    }
    state.selectedId = current.dataset.id;
    persistEditorView();
    render();
    state.editor?.focus?.();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (state.batchMode) {
      setBatchMode(false);
      return;
    }
    elements.noteSearch.focus();
    return;
  }
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const rows = [...elements.list.querySelectorAll(".note-row:not(:disabled)")];
  const index = rows.indexOf(current);
  if (index < 0) return;
  event.preventDefault();
  if (event.key === "ArrowUp" && index === 0) {
    elements.noteSearch.focus();
    return;
  }
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? rows.length - 1
      : Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
  rows[nextIndex]?.focus();
}

function openEditorSearch() {
  if (!requireOwnerAccess() || !state.editor) return;
  if (state.slashMenuOpen) closeSlashMenu();
  if (state.linkPopoverOpen) closeLinkPopover();
  const command = window.CodeMirror?.commands?.findPersistent ? "findPersistent" : "find";
  if (!window.CodeMirror?.commands?.[command]) {
    setStatus("查找功能未加载", true);
    return;
  }
  state.editor.execCommand(command);
  state.editor.focus();
}

function searchShortcut(command, respectVimNormal) {
  return (cm) => {
    const vim = state.editorMode === "vim" ? cm.state?.vim : null;
    if (respectVimNormal && vim && !vim.insertMode && !vim.visualMode) return window.CodeMirror.Pass;
    if (state.slashMenuOpen) closeSlashMenu();
    if (state.linkPopoverOpen) closeLinkPopover();
    const resolved = window.CodeMirror?.commands?.[command] ? command : "find";
    cm.execCommand(resolved);
    return undefined;
  };
}

function updateEditorStats() {
  const value = getEditorValue();
  const cursor = state.editor ? state.editor.getCursor() : textareaCursor(fields.content);
  const charCount = value.replace(/\s/g, "").length;
  elements.editorMode.textContent = state.sourceMode ? "源码" : (state.editorMode === "vim" ? "Vim" : "所见");
  elements.editorPosition.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
  elements.editorWords.textContent = `${charCount} 字`;
  elements.toggleVim.classList.toggle("is-active", state.editorMode === "vim");
  elements.toggleVim.setAttribute("aria-pressed", state.editorMode === "vim" ? "true" : "false");
  elements.toggleSource.classList.toggle("is-active", state.sourceMode);
  elements.toggleSource.setAttribute("aria-pressed", state.sourceMode ? "true" : "false");
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
    pending: "等待本机保存",
    saving: "保存到本机",
    saved: "已保存到本机",
    error: "本机保存失败"
  };
  elements.dirty.textContent = labels[state.autosaveStatus] || (state.dirty ? "等待本机保存" : "已保存到本机");
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
  if (value && state.slashMenuOpen) closeSlashMenu();
  elements.noteSearch.disabled = value;
  [
    elements.newNote,
    elements.duplicateNote,
    elements.deleteNote,
    elements.pullRemote,
    elements.saveDraftRemote,
    elements.publishRemote,
    elements.exportWorkspace,
    elements.importWorkspace,
    elements.noteHistory,
    elements.saveLocal,
    elements.saveConfig,
    elements.logoutAdmin,
    elements.toggleVim,
    elements.toggleSource,
    elements.editorSearch,
    elements.blockToggle,
    elements.toggleTypewriter,
    elements.toggleFocus
  ].filter(Boolean).forEach((button) => {
    button.disabled = value;
  });
  const note = getSelectedNote();
  elements.duplicateNote.disabled = value || !note;
  elements.deleteNote.disabled = value || !note;
  elements.toggleFocus.disabled = value || !note;
  if (elements.toggleTypewriter) elements.toggleTypewriter.disabled = value || !note;
  elements.toggleSource.disabled = value || !note;
  elements.editorSearch.disabled = value || !note;
  elements.blockToggle.disabled = value || !note;
  Object.values(fields).forEach((field) => {
    field.disabled = value || !note;
  });
  fields.status.disabled = true;
  setEditorEnabled(Boolean(note) && !value);
  elements.list.querySelectorAll("button").forEach((button) => {
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

function loadEditorView() {
  try {
    const raw = localStorage.getItem(EDITOR_VIEW_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
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
  state.config = normalizeConfig({
    ...state.config,
    apiBase: elements.configApiBase.value.trim()
  });
  persistConfig();
  hydrateConfigForm();
  setStatus("发布服务配置已保存");
}

function persistConfig() {
  const persistent = { ...state.config, sessionToken: "" };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(persistent));
  try {
    if (state.config.sessionToken) {
      sessionStorage.setItem(SESSION_KEY, state.config.sessionToken);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // The Worker cookie remains available when session storage is blocked.
  }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    let sessionToken = String(stored.sessionToken || "");
    try {
      sessionToken = sessionStorage.getItem(SESSION_KEY) || sessionToken;
      if (sessionToken) sessionStorage.setItem(SESSION_KEY, sessionToken);
    } catch {
      // Fall back to the HttpOnly Worker cookie.
    }
    if (stored.sessionToken) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...stored, sessionToken: "" }));
    }
    return normalizeConfig({ ...DEFAULT_CONFIG, ...stored, sessionToken });
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
  await syncRemotePosts({ initial: false });
}

async function saveDraftRemote() {
  if (!requireOwnerAccess()) return;
  saveConfig();
  const note = getSelectedNote();
  if (!note) {
    setStatus("先选择一篇笔记", true);
    return;
  }
  if (hasPendingImageUploads(note.id)) {
    setStatus("图片仍在上传，请完成或移除后再保存草稿", true);
    return;
  }
  fields.slug.value = syncDraftSlug(note);
  if (!validateSelected()) return;

  setBusy(true);
  const draftNote = normalizeNote({
    ...note,
    status: "draft",
    updatedAt: new Date().toISOString()
  });
  const submittedFingerprint = noteContentFingerprint(draftNote);
  setStatus("正在保存远端草稿...");
  let remote = null;
  try {
    remote = await apiFetch("/api/drafts", {
      method: "POST",
      body: JSON.stringify({ note: draftNote })
    });
  } catch (error) {
    setStatus(`远端草稿失败：${error.message}`, true);
    return;
  } finally {
    setBusy(false);
  }

  const current = state.data.notes.find((item) => item.id === draftNote.id);
  if (!current) {
    setStatus("草稿已提交，但本地页面已不存在，请重新同步", true);
    return;
  }
  const unchanged = noteContentFingerprint(current) === submittedFingerprint;
  current.status = "draft";
  current.slug = remote.slug || current.slug;
  current.remotePath = remote.path || current.remotePath;
  current.remoteSha = remote.sha || current.remoteSha;
  current.updatedAt = draftNote.updatedAt;
  current.localDirty = !unchanged;
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  state.dirty = current.localDirty;
  state.autosaveStatus = current.localDirty ? "pending" : "saved";
  persistWorkspace(false);
  render();
  if (current.localDirty) scheduleAutosave();
  setStatus(current.localDirty ? "远端草稿已保存，本地仍有未推送修改" : "远端草稿已保存，可在其他设备同步");
}

function exportWorkspace() {
  if (!requireOwnerAccess()) return;
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    library: state.library,
    data: serializeData()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tomfng-notes-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("已导出本机工作区");
}

async function importWorkspaceFromFile(event) {
  if (!requireOwnerAccess()) return;
  const file = event.target?.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const notes = normalizeNotesData(payload.data || payload).notes;
    if (!notes.length) throw new Error("文件中没有笔记");
    if (!window.confirm(`导入将合并 ${notes.length} 篇笔记到当前工作区，是否继续？`)) return;
    const byId = new Map(state.data.notes.map((note) => [note.id, note]));
    notes.forEach((note) => {
      const existing = byId.get(note.id);
      if (!existing) {
        state.data.notes.unshift(normalizeNote({ ...note, localDirty: true }));
        return;
      }
      if (noteContentFingerprint(existing) !== noteContentFingerprint(note)) {
        Object.assign(existing, normalizeNote({
          ...existing,
          ...note,
          id: existing.id,
          localDirty: true,
          updatedAt: new Date().toISOString()
        }));
      }
    });
    if (payload.library) {
      state.library = normalizeLibraryState(payload.library);
      persistLibraryState();
    }
    markDirty(`已导入 ${notes.length} 篇笔记`);
    render();
  } catch (error) {
    setStatus(`导入失败：${error.message}`, true);
  }
}

async function openNoteHistory() {
  if (!requireOwnerAccess()) return;
  const note = getSelectedNote();
  if (!note?.remotePath) {
    setStatus("先同步或保存远端后再查看历史", true);
    return;
  }
  if (!elements.historyDialog) return;
  elements.historyPath.textContent = note.remotePath;
  elements.historyList.innerHTML = `<div class="admin-history-empty">加载中…</div>`;
  elements.historyDialog.showModal?.();
  try {
    const result = await apiFetch(`/api/posts/history?path=${encodeURIComponent(note.remotePath)}`);
    const commits = Array.isArray(result.commits) ? result.commits : [];
    if (!commits.length) {
      elements.historyList.innerHTML = `<div class="admin-history-empty">暂无提交记录</div>`;
      return;
    }
    elements.historyList.innerHTML = commits.map((commit) => `
      <a class="admin-history-item" href="${escapeHtml(commit.url)}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(commit.shortSha || commit.sha || "")}</strong>
        <span>${escapeHtml(commit.message || "")}</span>
        <small>${escapeHtml(commit.author || "")} · ${escapeHtml(formatDate(commit.date))}</small>
      </a>
    `).join("");
  } catch (error) {
    elements.historyList.innerHTML = `<div class="admin-history-empty">读取失败：${escapeHtml(error.message)}</div>`;
  }
}

async function syncRemotePosts({ initial = false } = {}) {
  if (hasPendingImageUploads()) {
    setStatus("图片仍在上传，请完成或移除后再同步", true);
    return;
  }
  state.publishPollId += 1;
  if (state.autosaveTimer || state.dirty) autoSaveWorkspace({ silent: true });
  const selected = getSelectedNote();
  const selectedPath = selected?.remotePath || "";
  setBusy(true);
  try {
    const remote = await apiFetch("/api/posts");
    const merged = mergeRemotePosts(state.data, remote.data || { notes: [] });
    state.data = merged.data;
    state.selectedId = state.data.notes.some((note) => note.id === state.selectedId)
      ? state.selectedId
      : state.data.notes.find((note) => selectedPath && note.remotePath === selectedPath)?.id || state.data.notes[0]?.id || null;
    state.dirty = false;
    state.autosaveStatus = "saved";
    persistWorkspace(false);
    const detail = merged.preserved
      ? `，保留 ${merged.preserved} 篇本地未发布修改`
      : "";
    setStatus(`${initial ? "已同步" : "同步完成"}：${state.data.notes.length} 篇文章${detail}`);
    render();
  } catch (error) {
    setStatus(`${initial ? "远程文章读取失败" : "同步失败"}：${error.message}`, true);
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
  if (hasPendingImageUploads(note.id)) {
    setStatus("图片仍在上传，请完成或移除后再发布", true);
    return;
  }
  fields.slug.value = syncDraftSlug(note);
  if (!validateSelected()) return;

  setBusy(true);
  const publishedNote = normalizeNote({
    ...note,
    status: "published",
    updatedAt: new Date().toISOString()
  });
  publishedNote.status = "published";
  const submittedFingerprint = noteContentFingerprint(publishedNote);
  setStatus("正在提交文章...");

  let remote = null;
  try {
    remote = await apiFetch("/api/publish", {
      method: "POST",
      body: JSON.stringify({ note: publishedNote })
    });
  } catch (error) {
    setStatus(`发布失败：${error.message}`, true);
    return;
  } finally {
    setBusy(false);
  }

  const current = state.data.notes.find((item) => item.id === publishedNote.id);
  if (!current) {
    setStatus("文章已提交，但当前本地页面已不存在，请重新同步", true);
    return;
  }
  const unchanged = noteContentFingerprint(current) === submittedFingerprint;
  current.status = "published";
  current.slug = remote.slug || current.slug;
  current.remotePath = remote.path || current.remotePath;
  current.remoteSha = remote.sha || current.remoteSha;
  current.updatedAt = publishedNote.updatedAt;
  current.localDirty = !unchanged;
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  state.dirty = current.localDirty;
  state.autosaveStatus = current.localDirty ? "pending" : "saved";
  persistWorkspace(false);
  render();

  if (current.localDirty) scheduleAutosave();
  if (remote.publicUrl) {
    const pollId = ++state.publishPollId;
    setStatus("已提交发布，正在生成网站...", false, remote.publicUrl);
    const live = await waitForPublishedPage(
      remote.publicUrl,
      publishedNote.title,
      remote.revision || "",
      pollId
    );
    if (pollId !== state.publishPollId) return;
    setStatus(
      live.ready ? "已上线" : "已提交发布，网站还在生成，稍后刷新就能看到",
      false,
      remote.publicUrl
    );
  } else {
    setStatus(`已发布文章：${remote.path || publishedNote.title}`);
  }
}

async function waitForPublishedPage(publicUrl, title, revision, pollId) {
  const attempts = 24;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (pollId !== state.publishPollId) return { ready: false, cancelled: true, url: publicUrl };
    await sleep(attempt === 1 ? 2500 : 5000);
    if (pollId !== state.publishPollId) return { ready: false, cancelled: true, url: publicUrl };
    try {
      const status = await apiFetch(
        `/api/publish-status?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(title || "")}&revision=${encodeURIComponent(revision || "")}`
      );
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
