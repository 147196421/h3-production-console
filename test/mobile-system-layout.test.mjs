import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("移动端运行状态保持独立纵向滚动", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.system-body\{[^}]*flex:1;min-height:0;[^}]*overflow-y:auto/);
  assert.match(css, /\.docs-dialog,\.system-dialog\{[^}]*height:100dvh;min-height:0/);
  assert.match(css, /\.system-body\{height:0;[^}]*scroll-padding-bottom:140px;touch-action:pan-y/);
});

test("后台不再包含在线更新和代理入口", async () => {
  const [html, js, server] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8")
  ]);
  for (const source of [html, js, server]) {
    assert.doesNotMatch(source, /proxyUrl|networkPanel|checkUpdate|runUpdate|api\/system\/update|raw\.githubusercontent/);
  }
  assert.match(html, />运行状态</);
  assert.match(server, /pathname === "\/api\/system\/status"/);
});
