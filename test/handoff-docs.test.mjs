import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("无聊天记录的新AI拥有明确接管入口", async () => {
  const doc = await readFile(new URL("../docs/10_新AI接管与第二集启动.md", import.meta.url), "utf8");
  assert.match(doc, /没有原聊天记录/);
  assert.match(doc, /EP01_C10_尾帧\.jpg/);
  assert.match(doc, /供销社老板_三视图\.jpg/);
  assert.match(doc, /8—12个任务/);
  assert.match(doc, /@文件名/);
});

test("固定参考图索引中的现有资产都能读取", async () => {
  const index = await readFile(new URL("../docs/07_资产索引与备份清单.md", import.meta.url), "utf8");
  const existing = [...index.matchAll(/public\/references\/([^`\n]+\.(?:jpg|png))/g)].map(match => match[1]);
  assert.ok(existing.length >= 15);
  for (const file of existing) await access(new URL(`../public/references/${file}`, import.meta.url));
});
