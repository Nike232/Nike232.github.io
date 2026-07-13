(function () {
const SCRIPT_URL = "/js/libs/mermaid.min.js";
const renderTasks = new WeakMap();
let libraryPromise = null;
let configuredLibrary = null;
let renderSequence = 0;

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  fontFamily: '"MiSans", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif',
  flowchart: {
    curve: "basis",
    htmlLabels: false,
    useMaxWidth: true
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 18,
    diagramMarginY: 18
  },
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#f7f7f5",
    primaryTextColor: "#37352f",
    primaryBorderColor: "#c9c8c4",
    secondaryColor: "#edf3ee",
    secondaryTextColor: "#37352f",
    secondaryBorderColor: "#aebdaf",
    tertiaryColor: "#f6f2e9",
    tertiaryTextColor: "#37352f",
    tertiaryBorderColor: "#c9bda4",
    lineColor: "#77746d",
    textColor: "#37352f",
    mainBkg: "#f7f7f5",
    nodeBorder: "#c9c8c4",
    clusterBkg: "#fbfbfa",
    clusterBorder: "#d9d8d4",
    edgeLabelBackground: "#ffffff",
    noteBkgColor: "#fff8dc",
    noteBorderColor: "#d8c88f",
    noteTextColor: "#37352f",
    actorBkg: "#f7f7f5",
    actorBorder: "#c9c8c4",
    actorTextColor: "#37352f",
    signalColor: "#77746d",
    signalTextColor: "#37352f",
    labelBoxBkgColor: "#ffffff",
    labelBoxBorderColor: "#d9d8d4",
    labelTextColor: "#37352f",
    loopTextColor: "#37352f",
    activationBkgColor: "#edf3ee",
    activationBorderColor: "#aebdaf",
    fontSize: "15px"
  }
};

function configureMermaid(library) {
  if (!library || typeof library.render !== "function") {
    throw new Error("Mermaid 未正确加载");
  }
  if (configuredLibrary !== library) {
    library.initialize(MERMAID_CONFIG);
    configuredLibrary = library;
  }
  return library;
}

function loadMermaid() {
  if (window.mermaid?.render) {
    return Promise.resolve(configureMermaid(window.mermaid));
  }
  if (libraryPromise) return libraryPromise;

  libraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-tomfng-mermaid-library]");
    const script = existing || document.createElement("script");
    let settled = false;

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(configureMermaid(window.mermaid));
      } catch (error) {
        libraryPromise = null;
        reject(error);
      }
    };
    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      libraryPromise = null;
      if (!existing) script.remove();
      const error = new Error("Mermaid 资源加载失败");
      error.code = "MERMAID_LOAD_FAILED";
      reject(error);
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.tomfngMermaidLibrary = "true";
      document.head.appendChild(script);
    } else if (window.mermaid?.render) {
      handleLoad();
    }
  });

  return libraryPromise;
}

async function render(source, container, options = {}) {
  if (!(container instanceof window.Element)) throw new Error("缺少 Mermaid 渲染容器");
  const code = String(source || "").trim();
  if (!code) throw new Error("Mermaid 图表内容为空");

  const task = {};
  renderTasks.set(container, task);
  const library = await loadMermaid();
  if (renderTasks.get(container) !== task || !container.isConnected) return { cancelled: true };

  const prefix = String(options.idPrefix || "tomfng-mermaid").replace(/[^a-z0-9_-]/gi, "-");
  const id = `${prefix}-${Date.now().toString(36)}-${(++renderSequence).toString(36)}`;
  try {
    const result = await library.render(id, code);
    if (renderTasks.get(container) !== task || !container.isConnected) return { cancelled: true };
    container.innerHTML = result.svg;
    result.bindFunctions?.(container);
    container.querySelector("svg")?.setAttribute("aria-label", options.label || "Mermaid 图表");
    return { cancelled: false, svg: result.svg };
  } catch (error) {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
    throw error;
  }
}

function cancel(container) {
  if (container instanceof window.Element) renderTasks.delete(container);
}

function conciseError(error) {
  const firstLine = String(error?.message || error || "图表渲染失败")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "图表渲染失败";
  return firstLine
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function staticDiagramNodes(root = document) {
  const nodes = [];
  if (root instanceof window.Element && root.matches("pre.tomfng-mermaid")) nodes.push(root);
  root.querySelectorAll?.("pre.tomfng-mermaid").forEach((node) => nodes.push(node));
  return nodes;
}

function renderStaticDiagram(node) {
  if (node.dataset.mermaidState === "loading" || node.dataset.mermaidState === "rendered") return;
  const source = node.textContent || "";
  node.dataset.mermaidState = "loading";
  node.classList.remove("is-mermaid-error");
  node.classList.add("is-mermaid-loading");
  node.setAttribute("aria-busy", "true");

  render(source, node, { idPrefix: "tomfng-article-mermaid", label: "文章图表" })
    .then((result) => {
      if (result.cancelled) return;
      node.dataset.mermaidState = "rendered";
      node.classList.remove("is-mermaid-loading");
      node.classList.add("is-mermaid-rendered");
      node.removeAttribute("aria-busy");
    })
    .catch((error) => {
      node.dataset.mermaidState = "error";
      node.classList.remove("is-mermaid-loading");
      node.classList.add("is-mermaid-error");
      node.removeAttribute("aria-busy");
      node.innerHTML = "";
      const label = document.createElement("span");
      label.className = "tomfng-mermaid-error-label";
      label.textContent = error?.code === "MERMAID_LOAD_FAILED" ? "图表加载失败" : "图表语法有误";
      const detail = document.createElement("small");
      detail.textContent = conciseError(error);
      node.append(label, detail);
    });
}

function renderAll(root = document) {
  const nodes = staticDiagramNodes(root);
  nodes.forEach(renderStaticDiagram);
  return nodes.length;
}

function start() {
  renderAll(document);
  try {
    window.swup?.hooks?.on("page:view", () => renderAll(document));
  } catch {
    // Swup is optional on standalone admin and reader pages.
  }
}

window.TomfngMermaid = {
  cancel,
  conciseError,
  load: loadMermaid,
  render,
  renderAll
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
}());
