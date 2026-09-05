import http from "node:http";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = path.join(DATA_DIR, "h3-console.sqlite");
const PORT = Number(process.env.PORT || 8926);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 300);

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(path.join(DATA_DIR, "videos"), { recursive: true });
await fs.mkdir(path.join(DATA_DIR, "frames"), { recursive: true });
await fs.mkdir(path.join(DATA_DIR, "references"), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    episode INTEGER NOT NULL,
    clip INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration INTEGER NOT NULL,
    shot_type TEXT NOT NULL DEFAULT '标准人物图',
    reference_hint TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    dialogue TEXT NOT NULL DEFAULT '',
    continuity TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待生成',
    notes TEXT NOT NULL DEFAULT '',
    video_path TEXT,
    start_frame_path TEXT,
    tail_frame_path TEXT,
    start_time REAL,
    tail_time REAL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, episode, clip),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(project_id, episode, clip);
`);

await seedIfEmpty();

function now() { return new Date().toISOString(); }
function safeId(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, ""); }
function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...headers });
  res.end(body);
}
function fail(res, status, message) { json(res, status, { error: message }); }
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("="); return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
}
function signSession(exp) {
  const payload = Buffer.from(String(exp)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function validSession(req) {
  const token = parseCookies(req).h3_session;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  return Number(Buffer.from(payload, "base64url").toString()) > Date.now();
}
async function bodyBuffer(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req, limit) { return JSON.parse((await bodyBuffer(req, limit)).toString("utf8") || "{}"); }
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    const out = []; const err = [];
    child.stdout.on("data", d => out.push(d)); child.stderr.on("data", d => err.push(d));
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString() }) : reject(new Error(Buffer.concat(err).toString() || `${command}退出码${code}`)));
  });
}
async function probeDuration(file) {
  const r = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const duration = Number(r.stdout.toString().trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取视频时长");
  return duration;
}
async function extractFrame(video, timestamp, output) {
  await run("ffmpeg", ["-y", "-v", "error", "-ss", timestamp.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "2", output]);
}
async function imageScore(file) {
  const r = await run("ffmpeg", ["-v", "error", "-i", file, "-vf", "scale=64:36,format=gray", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]);
  const p = r.stdout; if (p.length < 64 * 36) return -1e9;
  let sum = 0; for (const v of p) sum += v;
  const mean = sum / p.length;
  let variance = 0; for (const v of p) variance += (v - mean) ** 2; variance /= p.length;
  let edges = 0; let count = 0;
  for (let y = 1; y < 35; y++) for (let x = 1; x < 63; x++) {
    const i = y * 64 + x;
    edges += Math.abs(p[i + 1] - p[i - 1]) + Math.abs(p[i + 64] - p[i - 64]); count += 2;
  }
  const brightnessPenalty = mean < 18 || mean > 242 ? 120 : Math.abs(mean - 128) * 0.08;
  return edges / count + Math.sqrt(variance) * 0.35 - brightnessPenalty;
}
async function chooseFrame(video, timestamps, tempDir, prefix) {
  const candidates = [];
  for (let i = 0; i < timestamps.length; i++) {
    const file = path.join(tempDir, `${prefix}_${i}.jpg`);
    await extractFrame(video, timestamps[i], file);
    candidates.push({ file, timestamp: timestamps[i], score: await imageScore(file) });
  }
  candidates.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
  return candidates[0];
}
export async function extractBestFrames(video, outputDir, baseName) {
  const duration = await probeDuration(video);
  const tempDir = path.join(outputDir, `.tmp-${baseName}-${crypto.randomUUID()}`);
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const startTimes = [...new Set([0.05, Math.min(0.25, duration * 0.1), Math.min(0.5, duration * 0.2)].filter(t => t < duration - 0.05).map(t => Number(t.toFixed(3))))];
    const tailTimes = [...new Set([1.2, 0.9, 0.6, 0.35, 0.15].map(offset => Math.max(0.05, duration - offset)).filter(t => t < duration).map(t => Number(t.toFixed(3))))];
    const start = await chooseFrame(video, startTimes, tempDir, "start");
    const tail = await chooseFrame(video, tailTimes, tempDir, "tail");
    const startPath = path.join(outputDir, `${baseName}_首帧.jpg`);
    const tailPath = path.join(outputDir, `${baseName}_尾帧.jpg`);
    await fs.copyFile(start.file, startPath); await fs.copyFile(tail.file, tailPath);
    return { duration, startPath, tailPath, startTime: start.timestamp, tailTime: tail.timestamp };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
async function parseMultipart(req) {
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method, headers: req.headers, body: Readable.toWeb(req), duplex: "half"
  });
  return request.formData();
}
function taskRow(row) {
  if (!row) return null;
  const pub = p => p ? `/media/${path.relative(DATA_DIR, p).split(path.sep).map(encodeURIComponent).join("/")}` : null;
  return { ...row, video_url: pub(row.video_path), start_frame_url: pub(row.start_frame_path), tail_frame_url: pub(row.tail_frame_path) };
}
function summary(projectId) {
  const row = db.prepare("SELECT COUNT(*) total, SUM(status='已完成') completed, SUM(status='需重做') retry FROM tasks WHERE project_id=?").get(projectId);
  return { total: Number(row.total || 0), completed: Number(row.completed || 0), retry: Number(row.retry || 0) };
}
async function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) count FROM projects").get().count;
  if (count) return;
  const seed = JSON.parse(await fs.readFile(path.join(ROOT, "seed-project.json"), "utf8"));
  importProject(seed);
}
function importProject(data) {
  if (!data || !data.id || !data.title || !Array.isArray(data.tasks)) throw new Error("项目JSON格式不正确");
  const projectId = safeId(data.id); if (!projectId) throw new Error("项目ID不正确");
  const stamp = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO projects(id,title,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at").run(projectId, String(data.title), stamp, stamp);
    const stmt = db.prepare(`INSERT INTO tasks(id,project_id,episode,clip,title,duration,shot_type,reference_hint,prompt,dialogue,continuity,status,notes,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET episode=excluded.episode,clip=excluded.clip,title=excluded.title,duration=excluded.duration,shot_type=excluded.shot_type,reference_hint=excluded.reference_hint,prompt=excluded.prompt,dialogue=excluded.dialogue,continuity=excluded.continuity,updated_at=excluded.updated_at`);
    for (const t of data.tasks) {
      const id = safeId(t.id); if (!id) throw new Error("存在无效任务ID");
      stmt.run(id, projectId, Number(t.episode), Number(t.clip), String(t.title || id), Number(t.duration || 10), String(t.shot_type || "标准人物图"), String(t.reference_hint || ""), String(t.prompt || ""), String(t.dialogue || ""), String(t.continuity || ""), String(t.status || "待生成"), String(t.notes || ""), stamp);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return projectId;
}
async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) return fail(res, 403, "禁止访问");
  try {
    const stat = await fs.stat(file); if (!stat.isFile()) throw new Error();
    const ext = path.extname(file); const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "content-length": stat.size, "cache-control": ext === ".html" ? "no-cache" : "public,max-age=3600" }); createReadStream(file).pipe(res);
  } catch { fail(res, 404, "文件不存在"); }
}
async function serveMedia(req, res, pathname) {
  if (!validSession(req)) return fail(res, 401, "请先登录");
  const rel = decodeURIComponent(pathname.replace(/^\/media\//, ""));
  const file = path.resolve(DATA_DIR, rel);
  if (!file.startsWith(DATA_DIR + path.sep)) return fail(res, 403, "禁止访问");
  try {
    const stat = await fs.stat(file); const ext = path.extname(file).toLowerCase();
    const types = { ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".mp4":"video/mp4", ".webm":"video/webm" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", "content-length": stat.size, "cache-control":"private,max-age=300" }); createReadStream(file).pipe(res);
  } catch { fail(res, 404, "素材不存在"); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`); const pathname = url.pathname;
    if (pathname === "/api/health") return json(res, 200, { ok: true, version: "1.0.0" });
    if (pathname === "/api/login" && req.method === "POST") {
      const { password } = await jsonBody(req, 16 * 1024);
      const a = Buffer.from(String(password || "")); const b = Buffer.from(ADMIN_PASSWORD);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 401, "密码不正确");
      const token = signSession(Date.now() + 7 * 86400_000);
      return json(res, 200, { ok: true }, { "set-cookie": `h3_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800` });
    }
    if (pathname === "/api/logout" && req.method === "POST") return json(res, 200, { ok: true }, { "set-cookie": "h3_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
    if (pathname.startsWith("/api/") && !validSession(req)) return fail(res, 401, "请先登录");
    if (pathname === "/api/projects" && req.method === "GET") {
      const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all().map(p => ({ ...p, summary: summary(p.id) })); return json(res, 200, { projects });
    }
    if (pathname === "/api/projects/import" && req.method === "POST") {
      const data = await jsonBody(req, 10 * 1024 * 1024); const id = importProject(data); return json(res, 200, { ok: true, project_id: id });
    }
    if (pathname === "/api/tasks" && req.method === "GET") {
      const project = safeId(url.searchParams.get("project")); const episode = Number(url.searchParams.get("episode") || 0);
      let rows = episode ? db.prepare("SELECT * FROM tasks WHERE project_id=? AND episode=? ORDER BY clip").all(project, episode) : db.prepare("SELECT * FROM tasks WHERE project_id=? ORDER BY episode,clip").all(project);
      return json(res, 200, { tasks: rows.map(taskRow), summary: summary(project) });
    }
    const taskMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)$/);
    if (taskMatch && req.method === "GET") return json(res, 200, { task: taskRow(db.prepare("SELECT * FROM tasks WHERE id=?").get(taskMatch[1])) });
    if (taskMatch && req.method === "PATCH") {
      const body = await jsonBody(req, 1024 * 1024); const allowed = ["status","notes","prompt","dialogue","continuity","reference_hint","shot_type"];
      const fields = allowed.filter(k => Object.hasOwn(body, k)); if (!fields.length) return fail(res, 400, "没有可更新字段");
      db.prepare(`UPDATE tasks SET ${fields.map(k => `${k}=?`).join(",")},updated_at=? WHERE id=?`).run(...fields.map(k => String(body[k] ?? "")), now(), taskMatch[1]);
      return json(res, 200, { task: taskRow(db.prepare("SELECT * FROM tasks WHERE id=?").get(taskMatch[1])) });
    }
    const uploadMatch = pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/video$/);
    if (uploadMatch && req.method === "POST") {
      const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(uploadMatch[1]); if (!task) return fail(res, 404, "任务不存在");
      const length = Number(req.headers["content-length"] || 0); if (length > MAX_UPLOAD_MB * 1024 * 1024) return fail(res, 413, `视频不能超过${MAX_UPLOAD_MB}MB`);
      const form = await parseMultipart(req); const file = form.get("video");
      if (!file || typeof file.arrayBuffer !== "function") return fail(res, 400, "请选择视频文件");
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return fail(res, 413, `视频不能超过${MAX_UPLOAD_MB}MB`);
      const ext = path.extname(file.name || "").toLowerCase(); if (![".mp4",".mov",".webm",".mkv"].includes(ext)) return fail(res, 400, "仅支持MP4、MOV、WEBM或MKV");
      const ep = `EP${String(task.episode).padStart(2,"0")}`; const base = `${ep}_C${String(task.clip).padStart(2,"0")}`;
      const videoDir = path.join(DATA_DIR, "videos", ep); const frameDir = path.join(DATA_DIR, "frames", ep); await fs.mkdir(videoDir,{recursive:true}); await fs.mkdir(frameDir,{recursive:true});
      const videoPath = path.join(videoDir, `${base}${ext}`); await fs.writeFile(videoPath, Buffer.from(await file.arrayBuffer()));
      const result = await extractBestFrames(videoPath, frameDir, base);
      db.prepare("UPDATE tasks SET video_path=?,start_frame_path=?,tail_frame_path=?,start_time=?,tail_time=?,status='已完成',updated_at=? WHERE id=?").run(videoPath,result.startPath,result.tailPath,result.startTime,result.tailTime,now(),task.id);
      return json(res, 200, { ok:true, duration:result.duration, task:taskRow(db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id)) });
    }
    if (pathname.startsWith("/media/")) return serveMedia(req, res, pathname);
    if (pathname.startsWith("/api/")) return fail(res, 404, "接口不存在");
    return serveStatic(res, pathname);
  } catch (error) {
    console.error(error); return fail(res, 500, error.message || "服务器错误");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`H3制作台已启动：http://${HOST}:${PORT}`);
  if (ADMIN_PASSWORD === "change-me-now") console.warn("警告：请设置ADMIN_PASSWORD后再开放公网访问");
});
