(function () {
const root = document.querySelector("[data-notes-reader]");
const tools = window.TomfngNoteTools;
if (!root || root.dataset.ready === "true" || !tools) return;
root.dataset.ready = "true";

const { escapeHtml, formatDate, markdownToHtml, normalizeCategory, normalizeNotesData } = tools;

const DATA_URL = "/notes-data.json";
const state = {
  data: normalizeNotesData({ notes: [] }),
  query: "",
  category: "all",
  tag: "all",
  selectedId: null
};

const elements = {
  count: root.querySelector("#note-count"),
  search: root.querySelector("#search-input"),
  categoryStrip: root.querySelector("#category-strip"),
  tagStrip: root.querySelector("#tag-strip"),
  list: root.querySelector("#note-list"),
  view: root.querySelector("#note-view")
};

init();

async function init() {
  bindEvents();
  await loadNotes();
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });
}

async function loadNotes() {
  renderLoading();
  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = normalizeNotesData(await response.json());
    state.selectedId = state.data.notes[0]?.id || null;
    render();
  } catch (error) {
    renderError(error);
  }
}

function getFilteredNotes() {
  const query = state.query;
  return state.data.notes.filter((note) => {
    const category = normalizeCategory(note.category);
    const matchesCategory = state.category === "all" || category === state.category;
    const matchesTag = state.tag === "all" || note.tags.includes(state.tag);
    const haystack = [note.title, category, note.summary, note.content, note.tags.join(" ")].join(" ").toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesTag && matchesQuery && note.status !== "archived";
  });
}

function render() {
  renderCategories();
  renderTags();
  const filtered = getFilteredNotes();
  elements.count.textContent = `${filtered.length}`;
  renderList(filtered);
  if (!filtered.some((note) => note.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || null;
  }
  renderSelected(filtered);
}

function renderCategories() {
  const categories = [...new Set(state.data.notes
    .filter((note) => note.status !== "archived")
    .map((note) => normalizeCategory(note.category)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (state.category !== "all" && !categories.includes(state.category)) {
    state.category = "all";
  }
  const buttons = ["all", ...categories].map((category) => {
    const label = category === "all" ? "全部分类" : category;
    const active = category === state.category ? " is-active" : "";
    return `<button class="category-filter${active}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`;
  });
  elements.categoryStrip.innerHTML = buttons.join("");
  elements.categoryStrip.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      render();
    });
  });
}

function renderTags() {
  const categoryNotes = state.data.notes.filter((note) => {
    return note.status !== "archived" && (state.category === "all" || normalizeCategory(note.category) === state.category);
  });
  const tags = [...new Set(categoryNotes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (state.tag !== "all" && !tags.includes(state.tag)) {
    state.tag = "all";
  }
  const buttons = ["all", ...tags].map((tag) => {
    const label = tag === "all" ? "全部" : tag;
    const active = tag === state.tag ? " is-active" : "";
    return `<button class="tag-filter${active}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(label)}</button>`;
  });
  elements.tagStrip.innerHTML = buttons.join("");
  elements.tagStrip.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.tag = button.dataset.tag;
      render();
    });
  });
}

function renderList(notes) {
  if (!notes.length) {
    const hasNotes = state.data.notes.some((note) => note.status !== "archived");
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>${hasNotes ? "没有匹配结果" : "还没有笔记"}</h2>
        <p>${hasNotes ? "换个关键词或标签试试。" : "从管理页新建一条笔记后，这里会变成你的文档列表。"}</p>
        ${hasNotes ? "" : '<a class="button-link" href="/admin/">新建笔记</a>'}
      </div>
    `;
    return;
  }

  elements.list.innerHTML = notes.map((note) => {
    const active = note.id === state.selectedId ? " is-active" : "";
    const tags = note.tags.slice(0, 3).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("");
    return `
      <button class="note-row${active}" type="button" data-id="${escapeHtml(note.id)}">
        <span class="note-row-title">
          <span>${escapeHtml(note.title)}</span>
          <span class="state-pill state-${escapeHtml(note.status)}">${escapeHtml(note.status)}</span>
        </span>
        <span class="note-row-meta">${escapeHtml(normalizeCategory(note.category))} / ${formatDate(note.updatedAt)}</span>
        <span class="note-row-summary">${escapeHtml(note.summary || note.content.slice(0, 120) || "无摘要")}</span>
        <span>${tags}</span>
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

function renderSelected(notes) {
  const note = notes.find((item) => item.id === state.selectedId);
  if (!note) {
    const hasNotes = state.data.notes.some((item) => item.status !== "archived");
    elements.view.innerHTML = `
      <div class="empty-state">
        <h2>${hasNotes ? "没有匹配结果" : "文档会在这里打开"}</h2>
        <p>${hasNotes ? "左侧没有符合当前筛选的笔记。" : "发布笔记后，正文会在这个区域阅读。"}</p>
      </div>
    `;
    return;
  }

  const tags = note.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("");
  elements.view.innerHTML = `
    <div class="note-kicker">
      <span class="category-pill">${escapeHtml(normalizeCategory(note.category))}</span>
      <span>${formatDate(note.updatedAt)}</span>
      <span class="state-pill state-${escapeHtml(note.status)}">${escapeHtml(note.status)}</span>
      ${tags}
    </div>
    <h1>${escapeHtml(note.title)}</h1>
    ${note.summary ? `<p class="note-summary">${escapeHtml(note.summary)}</p>` : ""}
    <div class="markdown-body">${markdownToHtml(contentWithoutTitleHeading(note) || " ")}</div>
  `;
}

function contentWithoutTitleHeading(note) {
  const title = String(note.title || "").trim();
  if (!title) return note.content || "";
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(note.content || "").replace(new RegExp(`^#\\s+${escaped}\\s*(\\n|$)`, "i"), "").trimStart();
}

function renderLoading() {
  elements.list.innerHTML = `
    <div class="skeleton">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
}

function renderError(error) {
  elements.count.textContent = "0";
  elements.list.innerHTML = "";
  elements.view.innerHTML = `
    <div class="error-state">
      <h2>读取失败</h2>
      <p>${escapeHtml(error.message || "无法读取 notes-data.json")}</p>
      <button class="ghost-button" type="button" id="retry-load">重试</button>
    </div>
  `;
  root.querySelector("#retry-load")?.addEventListener("click", loadNotes);
}
}());
