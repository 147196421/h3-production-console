import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const tasks=JSON.parse(fs.readFileSync(new URL("../seed-project.json",import.meta.url))).tasks;
test("copied prompts keep timeline and model assets without interface metadata",()=>{
  const ctx=vm.createContext({localStorage:{getItem:()=>"h3"},tasks});
  vm.runInContext(source.slice(0,source.indexOf("async function api(")),ctx);
  for(const model of ["h3","grok"]){
    vm.runInContext(`state.model="${model}"`,ctx);
    for(let i=0;i<tasks.length;i++){
      const p=vm.runInContext(`buildPlatformPrompt(tasks[${i}])`,ctx);
      assert.doesNotMatch(p,/【当前模型】|【H3|【Grok|稳定分段|电影运动|操作步骤/);
      assert.deepEqual([...p.matchAll(/【(\d+-\d+)秒】/g)].map(m=>m[1]),[...tasks[i].prompt.matchAll(/【(\d+-\d+)秒】/g)].map(m=>m[1]));
      if(i===1||i===2)assert.ok(p.includes(`@EP01_C0${i}_${model.toUpperCase()}_尾帧.jpg`));
      if(i===6)assert.doesNotMatch(p,/一条连续电影镜头|纸币落桌/);
      if(i===8)assert.doesNotMatch(p,/妻子、小满、林国强/);
      if(i===9){assert.ok(p.includes("最后0.3秒"));assert.doesNotMatch(p,/结尾稳住道具位置|留下清楚尾帧/);}
    }
  }
});
