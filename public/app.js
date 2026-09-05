const $ = s => document.querySelector(s);
const state = { projects: [], tasks: [], current: null, projectId: null, episode: 1 };
const REFERENCE_NAMES = ["林国强","苏清禾","林小满","周永发","陈大海","郑文博","何秀英","高峰"];

function referenceCards(task) {
  const source = `${task.reference_hint || ""} ${task.prompt || ""}`;
  const cards = REFERENCE_NAMES.filter(name => source.includes(name)).map(name => ({
    name, file: `${name}_三视图.jpg`,
    url: `/references/${encodeURIComponent(`${name}_三视图.jpg`)}`,
    kind: "人物标准图"
  }));
  if (task.shot_type === "尾帧续拍") {
    const idx = state.tasks.findIndex(t => t.id === task.id);
    const previous = idx > 0 ? state.tasks[idx - 1] : null;
    cards.unshift(previous?.tail_frame_url ? {
      name: `${previous.id} 尾帧`, file: `${previous.id.replace("-", "_")}_尾帧.jpg`,
      url: previous.tail_frame_url, kind: "优先使用"
    } : { name: "上一镜尾帧", file: "请先完成上一镜", url: null, kind: "等待生成" });
  }
  if (!cards.length) cards.push({ name:"场景首帧", file:"需要按本镜说明准备", url:null, kind:"场景素材" });
  return cards;
}

function renderReferenceCards(task) {
  return `<div class="reference-gallery">${referenceCards(task).map(a => a.url ? `
    <article class="reference-card">
      <a class="reference-preview" href="${a.url}" target="_blank"><img src="${a.url}" alt="${esc(a.name)}参考图"></a>
      <div class="reference-info"><span>${esc(a.kind)}</span><strong>${esc(a.name)}</strong><code>${esc(a.file)}</code></div>
      <a class="download-ref" href="${a.url}" download="${esc(a.file)}">下载到相册</a>
    </article>` : `
    <article class="reference-card missing"><div class="reference-placeholder">暂无图片</div>
      <div class="reference-info"><span>${esc(a.kind)}</span><strong>${esc(a.name)}</strong><code>${esc(a.file)}</code></div>
    </article>`).join("")}</div>`;
}

function to3DPrompt(prompt) {
  const cleaned = String(prompt || "")
    .replaceAll("2D写实动画", "高质量3D写实国漫动画")
    .replaceAll("二维写实动画", "高质量3D写实国漫动画")
    .replaceAll("竖屏2D写实动画", "竖屏9:16，高质量3D写实国漫动画");
  return cleaned.includes("3D") ? cleaned : `高质量3D写实国漫动画，电影级灯光，PBR材质，真实布料与皮肤质感，人物比例自然。${cleaned}`;
}

function buildHaomjPrompt(task) {
  const assets = referenceCards(task);
  const ready = assets.filter(a => a.url).map(a => a.file);
  const missing = assets.filter(a => !a.url).map(a => `${a.name}（${a.file}）`);
  const atLine = ready.length ? ready.map(name => `@${name}`).join("、") : "本镜暂无可直接引用的图片";
  const missingLine = missing.length ? `\n【尚需准备】${missing.join("、")}` : "";
  return `【先上传参考图，然后在好漫剧唯一的提示词框点击“@引用参考图”，依次选择】\n${atLine}${missingLine}\n\n【3D视频提示词】\n${to3DPrompt(task.prompt)}\n\n【本镜结尾与衔接】\n${task.continuity || "保持人物脸型、服装、场景、光线和镜头方向连续。"}\n\n【统一限制】\n全程采用高质量3D写实国漫动画、PBR材质、电影级光影，并保持参考图人物身份、五官、发型、年龄、服装和身材一致；禁止平面插画感、人物变脸、穿模、多余肢体、手指畸形、现代物件、字幕、文字、Logo和水印。`;
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) { showLogin(); throw new Error("请先登录"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }
function showLogin() { $("#login").classList.remove("hidden"); }
function hideLogin() { $("#login").classList.add("hidden"); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

async function loadProjects() {
  const { projects } = await api("/api/projects"); state.projects = projects;
  if (!state.projectId || !projects.some(p => p.id === state.projectId)) state.projectId = projects[0]?.id;
  $("#projectSelect").innerHTML = projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  $("#projectSelect").value = state.projectId || "";
  await loadAllTasks();
}
async function loadAllTasks() {
  if (!state.projectId) return;
  const { tasks, summary } = await api(`/api/tasks?project=${encodeURIComponent(state.projectId)}`);
  const episodes = [...new Set(tasks.map(t => t.episode))];
  if (!episodes.includes(state.episode)) state.episode = episodes[0] || 1;
  $("#episodeSelect").innerHTML = episodes.map(e => `<option value="${e}">第${String(e).padStart(2,"0")}集</option>`).join("");
  $("#episodeSelect").value = state.episode;
  updateProgress(summary); await loadTasks();
}
async function loadTasks(selectId) {
  const data = await api(`/api/tasks?project=${encodeURIComponent(state.projectId)}&episode=${state.episode}`);
  state.tasks = data.tasks; renderTaskList();
  const target = state.tasks.find(t => t.id === selectId) || state.tasks.find(t => t.status !== "已完成") || state.tasks[0];
  if (target) selectTask(target.id); else $("#taskEditor").innerHTML = '<div class="empty-state">这一集还没有任务</div>';
}
function updateProgress(summary) {
  const pct = summary.total ? Math.round(summary.completed / summary.total * 100) : 0;
  $("#progressText").textContent = `${summary.completed} / ${summary.total}`; $("#progressPct").textContent = `${pct}%`; $("#progressBar").style.width = `${pct}%`;
}
function renderTaskList() {
  $("#taskCount").textContent = `${state.tasks.length}段`;
  $("#taskList").innerHTML = state.tasks.map(t => `<button class="task-item ${state.current?.id===t.id?'active':''}" data-id="${esc(t.id)}"><span class="clip-no">${String(t.clip).padStart(2,"0")}</span><span class="task-copy"><strong>${esc(t.title)}</strong><small>${t.duration}秒 · ${esc(t.shot_type)}</small></span><i class="status-dot ${t.status==='已完成'?'done':t.status==='需重做'?'retry':''}"></i></button>`).join("");
  document.querySelectorAll(".task-item").forEach(b => b.onclick = () => selectTask(b.dataset.id));
}
function selectTask(id) {
  state.current = state.tasks.find(t => t.id === id); if (!state.current) return;
  renderTaskList(); renderEditor(); renderOutput();
}
function renderEditor() {
  const t = state.current; const el = $("#taskEditor"); el.classList.remove("empty");
  el.innerHTML = `<div class="task-head"><div><span class="task-code">${esc(t.id)}</span><h2>${esc(t.title)}</h2><div class="chips"><span class="chip">${t.duration}秒</span><span class="chip">${esc(t.shot_type)}</span><span class="chip">${esc(t.status)}</span></div></div></div>
    <div class="form-section"><label>本镜参考素材 <small class="label-tip">点图片查看大图</small></label>${renderReferenceCards(t)}<textarea id="referenceHint" class="short-field reference-note">${esc(t.reference_hint)}</textarea></div>
    <div class="haomj-steps"><strong>好漫剧操作顺序</strong><ol><li>下载上面的参考图到相册</li><li>在好漫剧上传图片</li><li>在唯一提示词框点“@引用参考图”，按上面文件名选择</li><li>复制下面整段提示词并生成</li></ol></div>
    <div class="form-section platform-section"><label>好漫剧单框提示词 <button class="copy copy-main" data-copy="platformPrompt">复制整段</button></label><p class="field-help">参考图名单、3D风格和首尾衔接已经合并，不需要再找其他输入框。</p><textarea id="platformPrompt" class="prompt platform-prompt" readonly>${esc(buildHaomjPrompt(t))}</textarea><textarea id="prompt" class="hidden">${esc(t.prompt)}</textarea></div>
    <div class="form-section"><label>后期配音文字 <button class="copy" data-copy="dialogue">复制配音</button></label><p class="field-help warning">不要输入好漫剧。生成视频后，在剪辑软件里配音和加字幕。</p><textarea id="dialogue" class="short-field">${esc(t.dialogue)}</textarea></div>
    <div class="form-section"><label>内部衔接记录</label><p class="field-help">不用单独输入好漫剧，内容已经自动并入上面的单框提示词。</p><textarea id="continuity" class="short-field">${esc(t.continuity)}</textarea></div>
    <div class="form-section"><label>制作备注</label><textarea id="notes" class="short-field" placeholder="记录废片原因、重做要求……">${esc(t.notes)}</textarea></div>
    <div class="actions"><button id="saveTask" class="primary">保存修改</button><button id="markRetry" class="danger">标记需重做</button><button id="nextTask" class="secondary">下一镜 →</button></div>`;
  document.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => { await navigator.clipboard.writeText($("#"+b.dataset.copy).value); toast("已复制"); });
  $("#saveTask").onclick = () => saveTask(); $("#markRetry").onclick = () => saveTask("需重做"); $("#nextTask").onclick = nextTask;
}
async function saveTask(status) {
  const body = { reference_hint:$("#referenceHint").value, prompt:$("#prompt").value, dialogue:$("#dialogue").value, continuity:$("#continuity").value, notes:$("#notes").value };
  if (status) body.status = status;
  const { task } = await api(`/api/tasks/${state.current.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
  Object.assign(state.current, task); renderTaskList(); renderEditor(); toast("已保存");
}
function nextTask() { const i = state.tasks.findIndex(t => t.id === state.current.id); if (i < state.tasks.length - 1) selectTask(state.tasks[i+1].id); else toast("已经是本集最后一镜"); }
function renderOutput() {
  const t = state.current; const has = t.start_frame_url && t.tail_frame_url;
  $("#frames").classList.toggle("hidden", !has); $("#uploadState").textContent = has ? "已提取" : "等待上传";
  if (has) {
    const stamp = `?v=${Date.now()}`; $("#startImage").src = t.start_frame_url+stamp; $("#tailImage").src = t.tail_frame_url+stamp;
    $("#startLink").href = t.start_frame_url; $("#tailLink").href = t.tail_frame_url;
    $("#startTime").textContent = `${Number(t.start_time).toFixed(2)}s`; $("#tailTime").textContent = `${Number(t.tail_time).toFixed(2)}s`;
  }
  const idx = state.tasks.findIndex(x => x.id === t.id); const next = state.tasks[idx+1];
  $("#nextHint").textContent = !next ? "这是本集最后一个镜头。" : next.shot_type === "尾帧续拍" ? `下一镜 ${next.id} 需要使用本镜推荐尾帧。` : `下一镜 ${next.id} 是“${next.shot_type}”，不必强行使用本镜尾帧。`;
}
async function uploadVideo(file) {
  if (!state.current || !file) return; const form = new FormData(); form.append("video", file);
  $("#uploadProgress").classList.remove("hidden"); $("#dropZone").classList.add("hidden");
  try {
    const { task } = await api(`/api/tasks/${state.current.id}/video`, { method:"POST", body:form });
    const index = state.tasks.findIndex(t => t.id === task.id); state.tasks[index] = task; state.current = task; renderTaskList(); renderOutput(); await loadProjects(); selectTask(task.id); toast("视频已保存，首尾帧已自动挑选");
  } catch(e) { toast(e.message); }
  finally { $("#uploadProgress").classList.add("hidden"); $("#dropZone").classList.remove("hidden"); $("#videoInput").value = ""; }
}

$("#loginForm").onsubmit = async e => { e.preventDefault(); $("#loginError").textContent = ""; try { await api("/api/login", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:$("#password").value})}); hideLogin(); await loadProjects(); } catch(err) { $("#loginError").textContent = err.message; } };
$("#logout").onclick = async () => { await fetch("/api/logout",{method:"POST"}); showLogin(); };
$("#projectSelect").onchange = async e => { state.projectId=e.target.value; state.episode=1; await loadAllTasks(); };
$("#episodeSelect").onchange = async e => { state.episode=Number(e.target.value); await loadTasks(); };
$("#videoInput").onchange = e => uploadVideo(e.target.files[0]);
const drop = $("#dropZone"); drop.ondragover = e => { e.preventDefault(); drop.classList.add("drag"); }; drop.ondragleave = () => drop.classList.remove("drag"); drop.ondrop = e => { e.preventDefault(); drop.classList.remove("drag"); uploadVideo(e.dataTransfer.files[0]); };
$("#importFile").onchange = async e => { const f=e.target.files[0]; if(!f)return; try { const data=JSON.parse(await f.text()); await api("/api/projects/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}); await loadProjects(); toast("任务已导入"); } catch(err){toast(err.message)} e.target.value=""; };

loadProjects().catch(e => { if (e.message !== "请先登录") toast(e.message); });
