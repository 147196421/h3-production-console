import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:["ignore", "ignore", "pipe"] }); const errors=[];
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("close", code => code === 0 ? resolve() : reject(new Error(Buffer.concat(errors).toString())));
  });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer(); socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => { const port=socket.address().port; socket.close(() => resolve(port)); });
  });
}
async function waitFor(url) {
  for (let i=0; i<40; i++) {
    try { const response=await fetch(url); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("测试服务未启动");
}

test("上传只保留首尾帧，成功和失败都清除临时视频", async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(), "h3-upload-")); const port=await freePort();
  const sample=path.join(dir, "sample.mp4");
  await run("ffmpeg", ["-y","-v","error","-f","lavfi","-i","testsrc2=size=180x320:rate=12","-t","2","-pix_fmt","yuv420p",sample]);
  const child=spawn(process.execPath, ["server.mjs"], { cwd:new URL("..",import.meta.url), env:{...process.env,DATA_DIR:path.join(dir,"data"),PORT:String(port),HOST:"127.0.0.1",ADMIN_PASSWORD:"test-password",SESSION_SECRET:"test-secret"}, stdio:"ignore" });
  try {
    const base=`http://127.0.0.1:${port}`; await waitFor(`${base}/api/health`);
    const login=await fetch(`${base}/api/login`, { method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:"test-password"}) });
    const cookie=login.headers.get("set-cookie").split(";",1)[0];
    const form=new FormData(); form.append("video",new Blob([await fs.readFile(sample)],{type:"video/mp4"}),"sample.mp4");
    const upload=await fetch(`${base}/api/tasks/EP01-C01/video?model=grok`,{method:"POST",headers:{cookie},body:form});
    assert.equal(upload.status,200); const result=await upload.json();
    assert.equal(result.original_video_retained,false); assert.equal(result.task.video_url,null);
    assert.ok(result.task.start_frame_url); assert.ok(result.task.tail_frame_url);
    assert.deepEqual(await fs.readdir(path.join(dir,"data","tmp","uploads")),[]);
    const bad=new FormData(); bad.append("video",new Blob(["not a video"],{type:"video/mp4"}),"broken.mp4");
    const failed=await fetch(`${base}/api/tasks/EP01-C02/video?model=grok`,{method:"POST",headers:{cookie},body:bad});
    assert.equal(failed.status,500); assert.deepEqual(await fs.readdir(path.join(dir,"data","tmp","uploads")),[]);
  } finally {
    child.kill("SIGTERM"); await new Promise(resolve => child.once("close",resolve)); await fs.rm(dir,{recursive:true,force:true});
  }
});
