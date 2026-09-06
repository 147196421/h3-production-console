import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const seed = JSON.parse(await fs.readFile(new URL("../seed-project.json", import.meta.url), "utf8"));

test("第一集镜头编号、时长与按秒段落连续", () => {
  const tasks = seed.tasks.filter(task => task.episode === 1);
  assert.equal(tasks.length, 10);
  tasks.forEach((task, index) => {
    assert.equal(task.id, `EP01-C${String(index + 1).padStart(2, "0")}`);
    const ranges = [...task.prompt.matchAll(/【(\d+)-(\d+)秒】/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.ok(ranges.length > 0, `${task.id} 缺少按秒分镜`);
    assert.equal(ranges[0][0], 0, `${task.id} 必须从0秒开始`);
    assert.equal(ranges.at(-1)[1], task.duration, `${task.id} 必须覆盖到镜头结尾`);
    ranges.slice(1).forEach((range, i) => assert.equal(range[0], ranges[i][1], `${task.id} 时间段存在空档或重叠`));
  });
});

test("尾帧续拍镜头引用紧邻上一镜尾帧", () => {
  seed.tasks.forEach((task, index) => {
    if (task.shot_type !== "尾帧续拍") return;
    assert.ok(index > 0, `${task.id} 不能作为首镜尾帧续拍`);
    assert.equal(seed.tasks[index - 1].episode, task.episode, `${task.id} 不能跨集尾帧续拍`);
    const previousFile = `@${seed.tasks[index - 1].id.replace("-", "_")}_尾帧.jpg`;
    assert.match(task.prompt, new RegExp(previousFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${task.id} 未引用${previousFile}`);
  });
});

test("第二集为九镜九十秒且时间轴完整", () => {
  const tasks = seed.tasks.filter(task => task.episode === 2);
  assert.equal(tasks.length, 9);
  assert.equal(tasks.reduce((sum, task) => sum + task.duration, 0), 90);
  tasks.forEach((task, index) => {
    assert.equal(task.id, `EP02-C${String(index + 1).padStart(2, "0")}`);
    assert.equal(task.duration, 10);
    const ranges = [...task.prompt.matchAll(/【(\d+)-(\d+)秒】/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.deepEqual(ranges, [[0,2],[2,4],[4,6],[6,8],[8,10]], `${task.id} 时间轴必须按2秒连续覆盖`);
  });
});

test("第二集连续性与剧情边界完整", () => {
  const byId = Object.fromEntries(seed.tasks.map(task => [task.id, task]));
  assert.equal(byId["EP02-C01"].shot_type, "新首帧");
  assert.match(byId["EP02-C01"].prompt, /不用黑色尾帧/);
  assert.match(byId["EP02-C04"].prompt, /挂钩取下.*维修包/);
  assert.match(byId["EP02-C05"].prompt, /街面干燥/);
  assert.match(byId["EP02-C07"].prompt, /没有明火、烟或火花/);
  assert.match(byId["EP02-C08"].prompt, /线路仍未更换/);
  assert.match(byId["EP02-C09"].prompt, /唯一一滴雨/);
  assert.match(byId["EP02-C09"].continuity, /EP03/);
});

test("人物、道具和核心动作桥不会凭空出现", () => {
  const byId = Object.fromEntries(seed.tasks.map(task => [task.id, task]));
  assert.match(byId["EP01-C03"].prompt, /木门向内打开/);
  assert.match(byId["EP01-C03"].prompt, /一手抱旧布娃娃/);
  assert.match(byId["EP01-C04"].prompt, /第三镜带入的旧布娃娃/);
  assert.match(byId["EP01-C05"].prompt, /旋钮上方约十厘米/);
  assert.match(byId["EP01-C06"].prompt, /第五镜结尾动作继续/);
  assert.match(byId["EP01-C07"].prompt, /为下一镜声音桥/);
  assert.match(byId["EP01-C08"].prompt, /声.*连续不断/);
});

test("全套提示词保持3D年代与衔接字段完整", () => {
  for (const task of seed.tasks) {
    assert.match(task.prompt, /3D写实国漫动画/);
    assert.doesNotMatch(task.prompt, /2D|二维|旧军绿色夹克/);
    assert.ok(task.reference_hint.trim(), `${task.id} 缺少参考素材`);
    assert.ok(task.continuity.trim(), `${task.id} 缺少衔接说明`);
  }
});

test("提示词中的固定参考图全部真实存在", async () => {
  const files = new Set(await fs.readdir(new URL("../public/references/", import.meta.url)));
  for (const task of seed.tasks) {
    const names = [...task.prompt.matchAll(/@([^\s；，：。]+?\.jpg)/g)].map(match => match[1]);
    for (const name of names) {
      if (name.includes("_尾帧")) continue;
      assert.ok(files.has(name), `${task.id} 引用了不存在的固定参考图：${name}`);
    }
  }
});
