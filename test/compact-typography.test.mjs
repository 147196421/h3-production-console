import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("后台使用紧凑字体且保留移动端触控尺寸", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /Compact production typography/);
  assert.match(css, /body\{font-size:15px\}/);
  assert.match(css, /\.platform-prompt\{font-size:14px;line-height:1\.64\}/);
  assert.match(css, /\.markdown-body\{font-size:15px;line-height:1\.68\}/);
  assert.match(css, /@media\(max-width:720px\)\{body\{font-size:14px\}/);
  assert.match(css, /\.platform-prompt\{min-height:330px;font-size:13px;line-height:1\.62\}/);
  assert.match(css, /\.actions button\{min-height:42px/);
});
