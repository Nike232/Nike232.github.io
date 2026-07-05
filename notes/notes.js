import { escapeHtml, formatDate, markdownToHtml, normalizeNotesData } from "/note-utils.js";

const DATA_URL = "/notes-data.json";
const state = {
  data: normalizeNotesData({ notes: [] }),
  query: "",
  tag: "all",
  selectedId: null
};

const elements = {
  count: document.querySelector("#note-count"),
  search: document.querySelector("#search-input"),
  tagStrip: document.querySelector("#tag-strip"),
  list: document.querySelector("#note-list"),
  view: document.querySelector("#note-view")
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
    const matchesTag = state.tag === "all" || note.tags.includes(state.tag);
    const haystack = [note.title, note.summary, note.content, note.tags.join(" ")].join(" ").toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesTag && matchesQuery && note.status !== "archived";
  });
}

function render() {
  const filtered = getFilteredNotes();
  elements.count.textContent = `${filtered.length}`;
  renderTags();
  renderList(filtered);
  if (!filtered.some((note) => note.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || null;
  }
  renderSelected(filtered);
}

function renderTags() {
  const tags = [...new Set(state.data.notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
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
    elements.list.innerHTML = `
      <div class="empty-state">
        <h2>还没有笔记</h2>
        <p>新的笔记会出现在这里。</p>
        <a class="button-link" href="/admin/">New note</a>
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
          <span class="state-pill">${escapeHtml(note.status)}</span>
        </span>
        <span class="note-row-meta">${formatDate(note.updatedAt)}</span>
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
    elements.view.innerHTML = `
      <div class="empty-state">
        <h2>空白页</h2>
        <p>当前筛选没有匹配的笔记。</p>
      </div>
    `;
    return;
  }

  const tags = note.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("");
  elements.view.innerHTML = `
    <div class="note-kicker">
      <span>${formatDate(note.updatedAt)}</span>
      <span>${escapeHtml(note.status)}</span>
      ${tags}
    </div>
    <h1>${escapeHtml(note.title)}</h1>
    ${note.summary ? `<p class="note-summary">${escapeHtml(note.summary)}</p>` : ""}
    <div class="markdown-body">${markdownToHtml(note.content || " ")}</div>
  `;
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
      <button class="ghost-button" type="button" id="retry-load">Retry</button>
    </div>
  `;
  document.querySelector("#retry-load")?.addEventListener("click", loadNotes);
}
