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

test("交接文档锁定视觉指纹、场景状态和跨集开拍门禁", async () => {
  const visual = await readFile(new URL("../docs/04_视觉声音与年代规范.md", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../docs/05_H3生产与首尾帧规范.md", import.meta.url), "utf8");
  const handoff = await readFile(new URL("../docs/06_AI接手说明.md", import.meta.url), "utf8");
  const ep02 = await readFile(new URL("../docs/12_EP02镜头连续性与生产交接.md", import.meta.url), "utf8");

  assert.match(visual, /项目视觉指纹/);
  assert.match(visual, /空间骨架层/);
  assert.match(visual, /持续状态层/);
  assert.match(visual, /临时表演层/);
  assert.match(visual, /@参考图.*真正起作用的时间段/);
  assert.match(workflow, /场景状态账本/);
  assert.match(workflow, /单集开拍门禁/);
  assert.match(handoff, /预制作完成、待上一集验收/);
  assert.match(ep02, /待EP01验收和开拍门禁/);
});
