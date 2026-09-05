import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("移动端系统管理保持独立纵向滚动", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.system-body\{[^}]*flex:1;min-height:0;[^}]*overflow-y:auto/);
  assert.match(css, /\.docs-dialog,\.system-dialog\{[^}]*height:100dvh;min-height:0/);
  assert.match(css, /\.system-body\{height:0;[^}]*scroll-padding-bottom:140px;touch-action:pan-y/);
  assert.match(css, /\.secret-input\{scroll-margin:18px 0 160px\}/);
});

test("移动端代理输入框获得焦点时会进入可见区域", async () => {
  const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(js, /\$\("#networkPanel"\)\.ontoggle/);
  assert.match(js, /\$\("#proxyUrl"\)\.onfocus/);
  assert.match(js, /scrollIntoView\(\{ block:"center" \}\)/);
});
