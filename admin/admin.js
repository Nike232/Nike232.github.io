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
  normalizeNote,
  normalizeNotesData,
  normalizeTags
} = tools;

const DATA_URL = "/notes-data.json";
const STORAGE_KEY = "tomfng-notes-workspace";
const CONFIG_KEY = "tomfng-notes-github-config";
const DEFAULT_CONFIG = {
  owner: "Nike232",
  repo: "Nike232.github.io",
  branch: "main",
  path: "notes-data.json",
  token: ""
};

const state = {
  data: normalizeNotesData({ notes: [] }),
  selectedId: null,
  dirty: false,
  remoteSha: null,
  config: loadConfig(),
  busy: false
};

const fields = {
  title: root.querySelector("#field-title"),
  slug: root.querySelector("#field-slug"),
  tags: root.querySelector("#field-tags"),
  status: root.querySelector("#field-status"),
  summary: root.querySelector("#field-summary"),
  content: root.querySelector("#field-content")
};

const elements = {
  count: root.querySelector("#admin-count"),
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
  configToken: root.querySelector("#config-token"),
  configOwner: root.querySelector("#config-owner"),
  configRepo: root.querySelector("#config-repo"),
  configBranch: root.querySelector("#config-branch"),
  configPath: root.querySelector("#config-path")
};

init();

async function init() {
  bindEvents();
  hydrateConfigForm();
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

function bindEvents() {
  elements.newNote.addEventListener("click", createNote);
  elements.duplicateNote.addEventListener("click", duplicateSelectedNote);
  elements.deleteNote.addEventListener("click", deleteSelectedNote);
  elements.saveLocal.addEventListener("click", saveWorkspace);
  elements.pullRemote.addEventListener("click", pullRemote);
  elements.publishRemote.addEventListener("click", publishRemote);
  elements.saveConfig.addEventListener("click", saveConfig);
  Object.values(fields).forEach((field) => field.addEventListener("input", updateSelectedFromFields));
  fields.status.addEventListener("change", updateSelectedFromFields);
  elements.form.addEventListener("submit", (event) => event.preventDefault());
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
  const now = new Date().toISOString();
  const note = normalizeNote({
    id: makeId(),
    title: "无标题",
    slug: `note-${Date.now().toString(36)}`,
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
  const note = getSelectedNote();
  if (!note) return;
  state.data.notes = state.data.notes.filter((item) => item.id !== note.id);
  state.selectedId = state.data.notes[0]?.id || null;
  markDirty("已在本地删除");
  render();
}

function updateSelectedFromFields() {
  const note = getSelectedNote();
  if (!note) return;
  note.title = fields.title.value.trimStart();
  note.slug = fields.slug.value.trim();
  note.tags = normalizeTags(fields.tags.value);
  note.status = fields.status.value;
  note.summary = fields.summary.value.trimStart();
  note.content = fields.content.value;
  note.updatedAt = new Date().toISOString();
  markDirty("正在编辑");
  renderList();
  renderPreview(note);
  validateSelected();
}

function render() {
  renderList();
  renderEditor();
  renderDirtyState();
}

function renderList() {
  elements.count.textContent = `${state.data.notes.length}`;
  if (!state.data.notes.length) {
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>没有页面</h2>
        <p>点击新建，开始写第一条笔记。</p>
      </div>
    `;
    return;
  }

  elements.list.innerHTML = state.data.notes.map((note) => {
    const active = note.id === state.selectedId ? " is-active" : "";
    return `
      <button class="note-row${active}" type="button" data-id="${escapeHtml(note.id)}">
        <span class="note-row-title">
          <span>${escapeHtml(note.title || "无标题")}</span>
          <span class="state-pill">${escapeHtml(note.status)}</span>
        </span>
        <span class="note-row-meta">${formatDate(note.updatedAt)}</span>
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
    fields.tags.value = "";
    fields.status.value = "draft";
    fields.summary.value = "";
    fields.content.value = "";
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
  fields.slug.value = note.slug;
  fields.tags.value = note.tags.join(", ");
  fields.status.value = note.status;
  fields.summary.value = note.summary;
  fields.content.value = note.content;
  renderPreview(note);
  validateSelected();
}

function renderPreview(note) {
  elements.previewTitle.textContent = note.title || "无标题";
  elements.previewSummary.textContent = note.summary || "";
  elements.previewContent.innerHTML = markdownToHtml(contentWithoutTitleHeading(note) || " ");
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
  if (!note.slug.trim()) {
    elements.errorSlug.textContent = "需要 slug";
    valid = false;
  }
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
  state.config = {
    token: elements.configToken.value.trim(),
    owner: elements.configOwner.value.trim() || DEFAULT_CONFIG.owner,
    repo: elements.configRepo.value.trim() || DEFAULT_CONFIG.repo,
    branch: elements.configBranch.value.trim() || DEFAULT_CONFIG.branch,
    path: elements.configPath.value.trim() || DEFAULT_CONFIG.path
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  setStatus("GitHub 配置已保存");
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return { ...DEFAULT_CONFIG, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function pullRemote() {
  saveConfig();
  if (!state.config.token) {
    setStatus("需要 GitHub Token", true);
    return;
  }
  setBusy(true);
  try {
    const remote = await getRemoteFile();
    state.remoteSha = remote.sha;
    state.data = normalizeNotesData(remote.data);
    state.selectedId = state.data.notes[0]?.id || null;
    state.dirty = false;
    persistWorkspace(false);
    setStatus("已拉取远程数据");
    render();
  } catch (error) {
    setStatus(`拉取失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function publishRemote() {
  saveConfig();
  if (!state.config.token) {
    setStatus("需要 GitHub Token", true);
    return;
  }
  if (!validateSelected() && state.data.notes.length) return;

  setBusy(true);
  try {
    let sha = state.remoteSha;
    try {
      const remote = await getRemoteFile();
      sha = remote.sha;
    } catch (error) {
      if (!String(error.message).includes("404")) throw error;
    }

    const payload = serializeData();
    const body = {
      message: `Update notes data: ${new Date().toISOString()}`,
      content: encodeBase64(JSON.stringify(payload, null, 2)),
      branch: state.config.branch
    };
    if (sha) body.sha = sha;

    const response = await githubFetch(fileApiUrl(), {
      method: "PUT",
      body: JSON.stringify(body)
    });
    state.remoteSha = response.content?.sha || sha;
    state.data = normalizeNotesData(payload);
    state.dirty = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setStatus("已发布到 GitHub");
    render();
  } catch (error) {
    setStatus(`发布失败：${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function getRemoteFile() {
  const response = await githubFetch(`${fileApiUrl()}?ref=${encodeURIComponent(state.config.branch)}`);
  return {
    sha: response.sha,
    data: JSON.parse(decodeBase64(response.content || ""))
  };
}

function fileApiUrl() {
  const owner = encodeURIComponent(state.config.owner);
  const repo = encodeURIComponent(state.config.repo);
  const path = state.config.path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

async function githubFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.config.token}`,
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
