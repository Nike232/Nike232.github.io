const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

function loadRenderer(mermaid) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://tomfng.space/"
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  window.mermaid = mermaid;
  delete require.cache[require.resolve("../source/mermaid-renderer.js")];
  require("../source/mermaid-renderer.js");
  return { dom, renderer: window.TomfngMermaid };
}

test("Mermaid renderer configures the local library and replaces a stage with SVG", async () => {
  let config;
  const { dom, renderer } = loadRenderer({
    initialize(value) {
      config = value;
    },
    async render(id, source) {
      return {
        svg: `<svg id="${id}" viewBox="0 0 100 40"><text>${source}</text></svg>`
      };
    }
  });
  const stage = document.createElement("div");
  document.body.appendChild(stage);

  const result = await renderer.render("graph TD; A-->B", stage, { label: "流程图" });

  assert.equal(result.cancelled, false);
  assert.equal(config.startOnLoad, false);
  assert.equal(config.securityLevel, "strict");
  assert.equal(stage.querySelector("svg").getAttribute("aria-label"), "流程图");
  assert.match(stage.textContent, /graph TD; A-->B/);
  dom.window.close();
});

test("Mermaid renderer ignores an asynchronous result after cancellation", async () => {
  let finish;
  const { dom, renderer } = loadRenderer({
    initialize() {},
    render() {
      return new Promise((resolve) => {
        finish = resolve;
      });
    }
  });
  const stage = document.createElement("div");
  stage.textContent = "loading";
  document.body.appendChild(stage);
  const pending = renderer.render("graph TD; A-->B", stage);
  await new Promise((resolve) => setImmediate(resolve));

  renderer.cancel(stage);
  finish({ svg: "<svg></svg>" });
  const result = await pending;

  assert.equal(result.cancelled, true);
  assert.equal(stage.textContent, "loading");
  dom.window.close();
});
