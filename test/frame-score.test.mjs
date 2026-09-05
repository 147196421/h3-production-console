import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function run(command,args){return new Promise((resolve,reject)=>{const p=spawn(command,args,{stdio:["ignore","pipe","pipe"]});const e=[];p.stderr.on("data",d=>e.push(d));p.on("close",c=>c===0?resolve():reject(new Error(Buffer.concat(e).toString())));});}

test("健康接口和首尾帧流程所需FFmpeg可用", async () => {
  await run("ffmpeg",["-version"]);
  await run("ffprobe",["-version"]);
  assert.ok(true);
});

test("可生成用于上传验证的竖屏视频", async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"h3-test-"));
  const out=path.join(dir,"sample.mp4");
  try{
    await run("ffmpeg",["-y","-v","error","-f","lavfi","-i","testsrc2=size=360x640:rate=24","-t","2","-pix_fmt","yuv420p",out]);
    const stat=await fs.stat(out); assert.ok(stat.size>1000);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
