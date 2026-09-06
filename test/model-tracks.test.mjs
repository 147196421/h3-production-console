import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("H3 and Grok outputs are persisted by task and model", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS task_outputs/);
  assert.match(server, /PRIMARY KEY\(task_id, model\)/);
  assert.match(server, /path\.join\(DATA_DIR, "videos", selectedModel, ep\)/);
  assert.match(server, /path\.join\(DATA_DIR, "frames", selectedModel, ep\)/);
});

test("UI exposes model selection and sends model to task and upload APIs", () => {
  assert.match(html, /id="modelSelect"/);
  assert.match(html, /value="h3">H3/);
  assert.match(html, /value="grok">Grok/);
  assert.match(app, /video\?model=\$\{state\.model\}/);
  assert.match(app, /episode=\$\{state\.episode\}&model=\$\{state\.model\}/);
});

test("prompts and inherited tail filenames change with model", () => {
  assert.match(app, /h3: \{ name:"H3", tag:"H3"/);
  assert.match(app, /grok: \{ name:"Grok", tag:"GROK"/);
  assert.match(app, /_\$\{modelProfile\(\)\.tag\}_尾帧\.jpg/);
  assert.match(app, /【动作衔接】/);
});

test("episode one has a distinct shot strategy for every H3 and Grok clip", () => {
  for (const model of ["h3", "grok"]) {
    const start = app.indexOf(`  ${model}: {`, app.indexOf("MODEL_SHOT_STRATEGIES"));
    const end = model === "h3" ? app.indexOf("  grok: {", start) : app.indexOf("  }\n};", start);
    const block = app.slice(start, end);
    for (let clip = 1; clip <= 10; clip++) {
      assert.match(block, new RegExp(`EP01-C${String(clip).padStart(2, "0")}`));
    }
  }
  assert.match(app, /【本镜专用运镜】\$\{shotStrategy\}/);
});
