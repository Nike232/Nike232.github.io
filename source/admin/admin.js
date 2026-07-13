(function () {
const root = document.querySelector("[data-notes-admin]");
const tools = window.TomfngNoteTools;
if (!root || root.dataset.ready === "true" || !tools) return;
root.dataset.ready = "true";

const {
  createHtmlToMarkdown,
  escapeHtml,
  extractMarkdownHeadings,
  filterNotesByQuery,
  formatDate,
  makeId,
  makeSlug,
  markdownBlockTemplate,
  markdownToHtml,
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
} = tools;

const STORAGE_KEY = "tomfng-notes-workspace";
const CONFIG_KEY = "tomfng-notes-github-config";
const SESSION_KEY = "tomfng-notes-admin-session";
const EDITOR_MODE_KEY = "tomfng-notes-editor-mode";
const EDITOR_VIEW_KEY = "tomfng-notes-editor-view";
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
  "math-block": "公式 数学 LaTeX TeX equation math",
  table: "表格 table grid",
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
  noteQuery: "",
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
  typewriterFrame: null,
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
  categoryStrip: root.querySelector("#admin-category-strip"),
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
  publishRemote: root.querySelector("#publish-remote"),
  saveConfig: root.querySelector("#save-config"),
  logoutAdmin: root.querySelector("#logout-admin"),
  toggleVim: root.querySelector("#toggle-vim"),
  toggleSource: root.querySelector("#toggle-source"),
  editorSearch: root.querySelector("#editor-search"),
  toggleFocus: root.querySelector("#toggle-focus"),
  selectionToolbar: root.querySelector("#editor-selection-toolbar"),
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
  elements.publishRemote.addEventListener("click", publishRemote);
  elements.saveConfig.addEventListener("click", saveConfig);
  elements.logoutAdmin.addEventListener("click", logoutAdmin);
  elements.toggleVim.addEventListener("click", toggleEditorMode);
  elements.toggleSource.addEventListener("click", () => toggleSourceMode());
  elements.editorSearch.addEventListener("click", openEditorSearch);
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
    renderList();
    renderSidebarMode();
  });
  elements.noteSearch.addEventListener("keydown", handleNoteSearchKeydown);
  elements.list.addEventListener("keydown", handleNoteListKeydown);
  elements.sidebarPages.addEventListener("click", () => setSidebarMode("pages"));
  elements.sidebarOutline.addEventListener("click", () => setSidebarMode("outline"));
  elements.selectionToolbar.addEventListener("mousedown", (event) => event.preventDefault());
  elements.selectionToolbar.querySelectorAll("[data-editor-command]").forEach((button) => {
    button.addEventListener("click", () => applyMarkdownCommand(button.dataset.editorCommand));
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
    if (event.key !== "Escape") return;
    if (state.slashMenuOpen) {
      closeSlashMenu();
      return;
    }
    if (state.blockMenuOpen) {
      toggleBlockMenu(false);
      return;
    }
    if (state.focusWriting) toggleFocusWriting(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (state.slashMenuOpen && !elements.slashMenu.contains(event.target)) closeSlashMenu();
    if (state.blockMenuOpen && !elements.blockMenu.contains(event.target) && !elements.blockToggle.contains(event.target)) {
      toggleBlockMenu(false);
    }
  });
  window.addEventListener("resize", autoSizeTitleField);
  window.addEventListener("resize", positionBlockMenu);
  window.addEventListener("resize", positionSlashMenu);
  window.addEventListener("scroll", () => {
    if (state.blockMenuOpen) toggleBlockMenu(false);
    if (state.slashMenuOpen) positionSlashMenu();
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
    hmdFold: {
      code: true,
      emoji: true,
      image: true,
      link: true,
      math: Boolean(katexRenderer)
    },
    hmdFoldMath: katexRenderer ? { renderer: katexRenderer } : false,
    hmdInsertFile: false,
    hmdReadLink: { baseURI: `${window.location.origin}/` },
    hmdModeLoader: useHyperMD ? loadCodeMirrorMode : false,
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
      F9: () => toggleFocusWriting()
    }
  };

  state.editor = useHyperMD
    ? window.HyperMD.fromTextArea(fields.content, editorOptions)
    : window.CodeMirror.fromTextArea(fields.content, editorOptions);

  state.editor.on("keydown", handleEditorRawShortcut);
  bindEditorImageTransfers();

  state.editor.on("change", (_cm, change) => {
    if (state.syncingEditor) return;
    fields.content.value = state.editor.getValue();
    updateSelectedFromFields();
    updateEditorStats();
    triggerTypingPulse(change);
    syncSlashMenuFromEditor({ allowOpen: isSlashTriggerChange(change) });
  });
  state.editor.on("cursorActivity", () => {
    updateEditorStats();
    syncEditorCursorStyle();
    scheduleSelectionToolbar();
    scheduleTypewriterCenter();
    updateOutlineActiveState();
    scheduleEditorViewSave();
    if (state.slashMenuOpen) syncSlashMenuFromEditor();
  });
  state.editor.on("focus", () => {
    setEditorFocusState(true);
    scheduleSelectionToolbar();
  });
  state.editor.on("blur", () => {
    setEditorFocusState(false);
    hideSelectionToolbar();
    if (state.slashMenuOpen) closeSlashMenu();
  });
  state.editor.on("vim-mode-change", (_cm, event) => {
    state.vimCursorMode = event?.mode || "normal";
    syncEditorCursorStyle();
  });
  state.editor.on("scroll", () => {
    syncEditorCursorStyle();
    hideSelectionToolbar();
    if (state.blockMenuOpen) toggleBlockMenu(false);
    if (state.slashMenuOpen) closeSlashMenu();
    scheduleEditorViewSave();
  });
  syncEditorCursorStyle();
  setEditorFocusState(state.editor.hasFocus?.());
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
    } else if (command === "link") {
      applyLinkCommand(cm);
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
  const label = selected || "链接";
  const markdown = `[${label.replace(/([\\\]])/g, "\\$1")}](https://)`;
  cm.replaceRange(markdown, from, to, "+format");
  if (selected) {
    const urlStart = from.ch + markdown.length - "https://)".length;
    cm.setSelection(
      { line: from.line, ch: urlStart },
      { line: from.line, ch: urlStart + "https://".length }
    );
  } else {
    cm.setSelection(
      { line: from.line, ch: from.ch + 1 },
      { line: from.line, ch: from.ch + 1 + label.length }
    );
  }
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
    } else if (command === "math-block") {
      insertMathBlock(cm);
    } else if (command === "table") {
      insertTableBlock(cm);
    } else if (command === "horizontal-rule") {
      const template = markdownBlockTemplate("horizontal-rule");
      insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
    }
  });
  cm.focus();
}

function toggleBlockMenu(force) {
  const open = typeof force === "boolean" ? force : !state.blockMenuOpen;
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
  const below = anchor.bottom + 8;
  const y = below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 8);
  menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
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
  menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
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

function insertMathBlock(cm) {
  const template = markdownBlockTemplate("math-block", cm.getSelection());
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
}

function insertTableBlock(cm) {
  const template = markdownBlockTemplate("table");
  insertStandaloneBlock(cm, template.body, template.selectionStart, template.selectionEnd);
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
  state.selectionToolbarFrame = window.requestAnimationFrame(syncSelectionToolbar);
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
  toolbar.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function hideSelectionToolbar() {
  elements.selectionToolbar.hidden = true;
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
  scheduleTypewriterCenter(true);
}

function scheduleTypewriterCenter(force = false) {
  if (!state.focusWriting || !state.editor) return;
  window.cancelAnimationFrame(state.typewriterFrame);
  state.typewriterFrame = window.requestAnimationFrame(() => centerActiveLine(force));
}

function centerActiveLine(force) {
  state.typewriterFrame = null;
  if (!state.focusWriting || !state.editor?.hasFocus?.()) return;
  const cursor = state.editor.charCoords(state.editor.getCursor(), "window");
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const upper = viewportHeight * 0.3;
  const lower = viewportHeight * 0.58;
  if (!force && cursor.top >= upper && cursor.bottom <= lower) return;
  window.scrollBy(0, cursor.top - viewportHeight * 0.43);
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

  [...state.imageUploads.values()]
    .filter((task) => task.noteId === note.id)
    .forEach((task) => removeImageUploadTask(task));
  discardEditorSession(note.id);
  state.data.notes = state.data.notes.filter((item) => item.id !== note.id);
  state.selectedId = state.data.notes[0]?.id || null;
  markDirty(published ? "已提交删除，网站正在更新" : "已删除本地草稿");
  render();
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
  renderCategories();
  renderList();
  renderEditor();
  renderOutline();
  renderSidebarMode();
  renderDirtyState();
  updateEditorStats();
}

function getCategories() {
  return [...new Set(state.data.notes.map((note) => normalizeCategory(note.category)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getVisibleNotes() {
  const categorized = state.category === "all"
    ? state.data.notes
    : state.data.notes.filter((note) => normalizeCategory(note.category) === state.category);
  return filterNotesByQuery(categorized, state.noteQuery);
}

function renderCategories() {
  const categories = getCategories();
  if (state.category !== "all" && !categories.includes(state.category)) {
    state.category = "all";
    persistEditorView();
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
      persistEditorView();
      render();
    });
  });
}

function renderList() {
  const visibleNotes = getVisibleNotes();
  elements.count.textContent = `${visibleNotes.length}`;
  if (!visibleNotes.length) {
    const searching = Boolean(state.noteQuery.trim());
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>${searching ? "没有匹配页面" : state.data.notes.length ? "这个分类是空的" : "没有页面"}</h2>
        <p>${searching ? "换个关键词继续查找。" : state.data.notes.length ? "新建页面会自动放进当前分类。" : "点击新建，开始写第一条笔记。"}</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = visibleNotes.map((note) => {
    const active = note.id === state.selectedId ? " is-active" : "";
    const stateName = note.remotePath ? (note.localDirty ? "有修改" : "已发布") : "草稿";
    const stateClass = note.remotePath ? (note.localDirty ? "pending" : "published") : "draft";
    return `
      <button class="note-row${active}" type="button" data-id="${escapeHtml(note.id)}"${state.busy ? " disabled" : ""}>
        <span class="note-row-title">
          <span>${escapeHtml(note.title || "无标题")}</span>
          <span class="state-pill state-${stateClass}">${stateName}</span>
        </span>
        <span class="note-row-meta">${escapeHtml(normalizeCategory(note.category))} / ${formatDate(note.updatedAt)}</span>
        <span class="note-row-summary">${escapeHtml(note.summary || note.content.slice(0, 110) || "无摘要")}</span>
      </button>
    `;
  }).join("");

  elements.list.querySelectorAll(".note-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      state.selectedId = row.dataset.id;
      render();
      if (event.detail === 0) state.editor?.focus?.();
    });
  });
}

function setSidebarMode(mode) {
  state.sidebarMode = mode === "outline" ? "outline" : "pages";
  persistEditorView();
  renderOutline();
  renderSidebarMode();
}

function renderSidebarMode() {
  const outlineMode = state.sidebarMode === "outline";
  elements.sidebarTitle.textContent = outlineMode ? "大纲" : "页面";
  elements.pageActions.hidden = outlineMode;
  elements.noteSearchWrap.hidden = outlineMode;
  elements.categoryStrip.hidden = outlineMode;
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
  elements.toggleFocus.disabled = disabled;
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
  fields.status.value = note.remotePath ? "published" : "draft";
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
  state.editorView.sidebarMode = state.sidebarMode;
  state.editorView = normalizeEditorViewState(state.editorView);
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
}

function toggleEditorMode() {
  if (!requireOwnerAccess()) return;
  if (state.slashMenuOpen) closeSlashMenu();
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
  state.sourceMode = typeof force === "boolean" ? force : !state.sourceMode;
  const cm = state.editor;
  if (cm) {
    const wrapper = cm.getWrapperElement?.();
    wrapper?.classList.toggle("note-source-mode", state.sourceMode);
    if (cm.getMode?.().name === "hypermd") {
      cm.operation(() => {
        cm.setOption("hmdHideToken", !state.sourceMode);
        cm.setOption("hmdFold", !state.sourceMode);
        cm.setOption("hmdTableAlign", !state.sourceMode);
      });
    }
    cm.refresh();
    cm.focus();
  }
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
  if (event.key === "Enter") {
    event.preventDefault();
    state.selectedId = current.dataset.id;
    persistEditorView();
    render();
    state.editor?.focus?.();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
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
    elements.publishRemote,
    elements.saveLocal,
    elements.saveConfig,
    elements.logoutAdmin,
    elements.toggleVim,
    elements.toggleSource,
    elements.editorSearch,
    elements.blockToggle,
    elements.toggleFocus
  ].forEach((button) => {
    button.disabled = value;
  });
  const note = getSelectedNote();
  elements.duplicateNote.disabled = value || !note;
  elements.deleteNote.disabled = value || !note;
  elements.toggleFocus.disabled = value || !note;
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
