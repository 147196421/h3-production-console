const $ = s => document.querySelector(s);
const state = { projects: [], tasks: [], current: null, projectId: null, episode: 1 };

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
    <div class="form-section"><label>本镜参考素材</label><textarea id="referenceHint" class="short-field">${esc(t.reference_hint)}</textarea></div>
    <div class="form-section"><label>H3提示词 <button class="copy" data-copy="prompt">复制提示词</button></label><textarea id="prompt" class="prompt">${esc(t.prompt)}</textarea></div>
    <div class="form-section"><label>后期对白／声音 <button class="copy" data-copy="dialogue">复制对白</button></label><textarea id="dialogue" class="short-field">${esc(t.dialogue)}</textarea></div>
    <div class="form-section"><label>首尾衔接</label><textarea id="continuity" class="short-field">${esc(t.continuity)}</textarea></div>
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
