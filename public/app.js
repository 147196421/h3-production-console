const $ = s => document.querySelector(s);
const state = { projects: [], tasks: [], current: null, projectId: null, episode: 1, systemChecked: false, system: null };
const REFERENCE_NAMES = ["林国强","苏清禾","林小满","周永发","陈大海","郑文博","何秀英","高峰"];
const FIXED_HOUSE_TASKS = new Set(["EP01-C01","EP01-C03","EP01-C04","EP01-C05","EP01-C06","EP01-C08","EP01-C09","EP01-C10"]);
const usesFixedHouse = (task, source) => FIXED_HOUSE_TASKS.has(task.id) || /林家土屋|破旧土屋|土屋/.test(source);
const TASK_REFERENCE_ASSETS = {
  "EP01-C03": [{ name:"收包袱双人构图", file:"林家土屋收包袱双人首帧.jpg", kind:"固定镜头首帧", anchor:"【0-2秒】", instruction:"以 @林家土屋收包袱双人首帧.jpg 锁定苏清禾前景、林国强背景和两人距离；" }],
  "EP01-C04": [{ name:"小满躲母亲近景", file:"小满躲母亲儿童近景首帧.jpg", kind:"固定镜头首帧", anchor:"【0-2秒】", instruction:"以 @小满躲母亲儿童近景首帧.jpg 锁定母女遮挡关系、儿童视线和近景机位；" }],
  "EP01-C05": [{ name:"林家三人对峙构图", file:"林家三人对峙首帧.jpg", kind:"固定镜头首帧", anchor:"【0-2秒】", instruction:"以 @林家三人对峙首帧.jpg 锁定三人站位、距离和对峙轴线；" }],
  "EP01-C06": [{ name:"1998破旧收音机", file:"1998破旧收音机道具三视图.jpg", kind:"固定道具图", anchor:"【0-2秒】", instruction:"以 @1998破旧收音机道具三视图.jpg 锁定收音机外形、旋钮、天线和磨损材质；" }],
  "EP01-C07": [{ name:"维修记忆蒙太奇", file:"维修记忆蒙太奇参考板.jpg", kind:"固定蒙太奇参考", anchor:"【0-2秒】", instruction:"以 @维修记忆蒙太奇参考板.jpg 统一电子管、电路板、焊接、纸币和修理铺的年代质感；" }],
  "EP01-C09": [{ name:"一家三口看收音机", file:"林家三口收音机同框首帧.jpg", kind:"固定镜头首帧", anchor:"【0-2秒】", instruction:"以 @林家三口收音机同框首帧.jpg 锁定三人三角构图、视线和收音机位置；" }],
  "EP01-C10": [{ name:"1998破旧收音机", file:"1998破旧收音机道具三视图.jpg", kind:"固定道具图", anchor:"【0-1秒】", instruction:"以 @1998破旧收音机道具三视图.jpg 锁定收音机外形、指示灯、扬声器和旋钮；" }]
};

function referenceCards(task) {
  const source = `${task.reference_hint || ""} ${task.prompt || ""}`;
  const cards = REFERENCE_NAMES.filter(name => String(task.reference_hint || "").includes(name) || String(task.prompt || "").includes(`@${name}_三视图.jpg`)).map(name => ({
    name, file: `${name}_三视图.jpg`,
    url: `/references/${encodeURIComponent(`${name}_三视图.jpg`)}`,
    kind: "人物标准图"
  }));
  if (usesFixedHouse(task, source)) cards.unshift({
    name: "林家土屋夜景首帧", file: "林家土屋夜景首帧.jpg",
    url: `/references/${encodeURIComponent("林家土屋夜景首帧.jpg")}`, kind: "固定场景母版"
  });
  for (const asset of TASK_REFERENCE_ASSETS[task.id] || []) cards.push({
    ...asset, url: `/references/${encodeURIComponent(asset.file)}`
  });
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
      <div class="reference-info"><span>${esc(a.kind)}</span><strong>${esc(a.name)}</strong><code>@${esc(a.file)}</code></div>
      <a class="download-ref" href="${a.url}" download="${esc(a.file)}">下载到相册</a>
    </article>` : `
    <article class="reference-card missing"><div class="reference-placeholder">暂无图片</div>
      <div class="reference-info"><span>${esc(a.kind)}</span><strong>${esc(a.name)}</strong><code>@${esc(a.file)}</code></div>
    </article>`).join("")}</div>`;
}

function to3DPrompt(prompt) {
  const cleaned = String(prompt || "")
    .replaceAll("2D写实动画", "高质量3D写实国漫动画")
    .replaceAll("二维写实动画", "高质量3D写实国漫动画")
    .replaceAll("竖屏2D写实动画", "竖屏9:16，高质量3D写实国漫动画")
    .replaceAll("旧军绿色夹克", "褪色深蓝旧工装夹克");
  return cleaned.includes("3D") ? cleaned : `高质量3D写实国漫动画，电影级灯光，PBR材质，真实布料与皮肤质感，人物比例自然。${cleaned}`;
}

function buildPlatformPrompt(task) {
  let prompt = to3DPrompt(task.prompt);
  const source = `${task.reference_hint || ""} ${prompt}`;
  if (usesFixedHouse(task, source) && !prompt.includes("@林家土屋夜景首帧.jpg")) {
    prompt = prompt.replace("【画幅与风格】", "【画幅与风格】以 @林家土屋夜景首帧.jpg 锁定床、窗、木桌、收音机、日历、煤油灯的位置和夜间光线；");
  }
  for (const asset of TASK_REFERENCE_ASSETS[task.id] || []) {
    if (!prompt.includes(`@${asset.file}`)) prompt = prompt.replace(asset.anchor, `${asset.anchor}${asset.instruction}`);
  }
  return `${prompt}\n\n【结尾状态】\n${task.continuity || "保持人物脸型、服装、场景、光线和镜头方向连续。"}\n\n【统一质量】\n高质量3D写实国漫动画，PBR材质，电影级体积光，真实皮肤与布料细节，动作符合物理惯性，镜头稳定，景深自然；人物身份、五官、年龄、发型、服装和身材严格一致；禁止平面插画感、变脸、穿模、多余肢体、手指畸形、现代物件、字幕、文字、Logo和水印。`;
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
function inlineMarkdown(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}
function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const html = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim(); const code = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++; html.push(`<pre class="md-code" data-language="${esc(language)}"><code>${esc(code.join("\n"))}</code></pre>`); continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const level = Math.min(heading[1].length, 4); html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); i++; continue; }
    if (/^\|.*\|$/.test(line) && /^\|?\s*:?-+/.test(lines[i + 1] || "")) {
      const rows = [];
      const cells = value => value.replace(/^\||\|$/g, "").split("|").map(cell => inlineMarkdown(cell.trim()));
      const head = cells(line); i += 2;
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) rows.push(cells(lines[i++]));
      html.push(`<div class="md-table-wrap"><table><thead><tr>${head.map(cell => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s+/, ""));
      html.push(`<ul>${items.map(item => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`); continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s+/, ""));
      html.push(`<ol>${items.map(item => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+|^```|^[-*]\s+|^\d+\.\s+|^\|.*\|$/.test(lines[i])) paragraph.push(lines[i++]);
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return html.join("");
}

async function loadProjects() {
  const { projects } = await api("/api/projects"); state.projects = projects;
  if (!state.projectId || !projects.some(p => p.id === state.projectId)) state.projectId = projects[0]?.id;
  $("#projectSelect").innerHTML = projects.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
  $("#projectSelect").value = state.projectId || "";
  await loadAllTasks();
  if (!state.systemChecked) checkSystem(true).catch(() => {});
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
    <div class="editor-tabs" role="tablist" aria-label="镜头编辑区域">
      <button class="editor-tab active" data-editor-tab="references" role="tab">参考素材</button>
      <button class="editor-tab" data-editor-tab="prompt" role="tab">生成提示</button>
      <button class="editor-tab" data-editor-tab="post" role="tab">后期设置</button>
    </div>
    <section class="editor-panel" data-editor-panel="references">
      <div class="section-heading"><div><h3>本镜参考素材</h3><p>点击图片查看大图，按文件名选择平台参考图</p></div><span>${referenceCards(t).length}张</span></div>
      ${renderReferenceCards(t)}
      <label class="field-label" for="referenceHint">素材说明</label><textarea id="referenceHint" class="short-field reference-note">${esc(t.reference_hint)}</textarea>
    </section>
    <section class="editor-panel" data-editor-panel="prompt" hidden>
      <details class="platform-steps"><summary>操作步骤</summary><ol><li>下载本镜参考图并上传到视频生成平台</li><li>复制整段提示词到唯一输入框</li><li>在每个“@文件名”原位置选择同名参考图</li></ol></details>
      <div class="section-heading prompt-heading"><div><h3>专业单框提示词</h3><p>已合并按秒分镜、3D质量和首尾衔接</p></div><button class="copy copy-main" data-copy="platformPrompt">复制整段</button></div>
      <textarea id="platformPrompt" class="prompt platform-prompt" readonly>${esc(buildPlatformPrompt(t))}</textarea><textarea id="prompt" class="hidden">${esc(t.prompt)}</textarea>
    </section>
    <section class="editor-panel" data-editor-panel="post" hidden>
      <label class="field-label">后期配音文字 <button class="copy" data-copy="dialogue">复制配音</button></label><p class="field-help warning">生成视频后，在剪辑软件里配音和加字幕。</p><textarea id="dialogue" class="short-field">${esc(t.dialogue)}</textarea>
      <label class="field-label spaced">内部衔接记录</label><p class="field-help">已经自动并入单框提示词。</p><textarea id="continuity" class="short-field">${esc(t.continuity)}</textarea>
      <label class="field-label spaced">制作备注</label><textarea id="notes" class="short-field" placeholder="记录废片原因、重做要求……">${esc(t.notes)}</textarea>
    </section>
    <div class="actions"><button id="saveTask" class="primary">保存修改</button><button id="markRetry" class="danger">标记需重做</button><button id="nextTask" class="secondary">下一镜 →</button></div>`;
  document.querySelectorAll("[data-editor-tab]").forEach(button => button.onclick = () => {
    document.querySelectorAll("[data-editor-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
    document.querySelectorAll("[data-editor-panel]").forEach(panel => panel.hidden = panel.dataset.editorPanel !== button.dataset.editorTab);
  });
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

function setActiveArea(area) {
  const buttons = { production: $("#showProduction"), docs: $("#openDocs"), system: $("#openSystem") };
  Object.entries(buttons).forEach(([name, button]) => button.classList.toggle("active", name === area));
}
async function openDocs() {
  setActiveArea("docs");
  $("#docsModal").classList.remove("hidden");
  try {
    const { docs } = await api("/api/docs");
    $("#docsList").innerHTML = docs.map((doc, index) => `<button class="doc-item${index === 0 ? " active" : ""}" data-doc="${esc(doc.name)}">${esc(doc.title)}</button>`).join("");
    $("#docsSelect").innerHTML = docs.map(doc => `<option value="${esc(doc.name)}">${esc(doc.title)}</option>`).join("");
    document.querySelectorAll(".doc-item").forEach(button => button.onclick = () => loadDoc(button.dataset.doc, button));
    if (docs[0]) await loadDoc(docs[0].name, $(".doc-item"));
  } catch (error) { $("#docContent").textContent = error.message; }
}
async function loadDoc(name, button) {
  const doc = await api(`/api/docs/${encodeURIComponent(name)}`);
  document.querySelectorAll(".doc-item").forEach(item => item.classList.toggle("active", item === button));
  $("#docsSelect").value = name;
  $("#docHeading").textContent = doc.title;
  state.docContent = doc.content;
  $("#docContent").innerHTML = renderMarkdown(doc.content.replace(/^#\s+.*\n?/, ""));
  $(".docs-reader").scrollTop = 0;
}
function closeDocs() { $("#docsModal").classList.add("hidden"); setActiveArea("production"); }
$("#showProduction").onclick = () => { closeDocs(); closeSystem(); window.scrollTo({ top: 0, behavior: "smooth" }); };
$("#openDocs").onclick = openDocs;
$("#closeDocs").onclick = closeDocs;
$("#docsSelect").onchange = e => loadDoc(e.target.value, document.querySelector(`[data-doc="${CSS.escape(e.target.value)}"]`));
$("#copyDoc").onclick = async () => { await navigator.clipboard.writeText(state.docContent || ""); toast("文档已复制"); };
$("#docsModal").onclick = e => { if (e.target === $("#docsModal")) closeDocs(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDocs(); });

function updateSystemView(data) {
  state.system = data; state.systemChecked = true;
  $("#currentVersion").textContent = `V${data.current_version}`;
  $("#latestVersion").textContent = data.remote.latest_version ? `V${data.remote.latest_version}` : "暂时无法获取";
  $("#mediaStatus").textContent = data.media_tools.ready ? "FFmpeg正常" : "组件缺失";
  $("#mediaStatus").classList.toggle("status-bad", !data.media_tools.ready);
  $("#updateBadge").classList.toggle("hidden", !data.remote.update_available);
  $("#runUpdate").disabled = !data.remote.update_available || Boolean(data.pending);
  if (data.pending) {
    $("#updateTitle").textContent = `正在等待更新到 V${data.pending.target_version}`;
    $("#updateMessage").textContent = "更新请求已提交，宿主机更新代理将在一分钟内处理。";
  } else if (data.remote.error) {
    $("#updateTitle").textContent = "暂时无法检查新版本";
    $("#updateMessage").textContent = data.remote.error;
  } else if (data.remote.update_available) {
    $("#updateTitle").textContent = `发现 V${data.remote.latest_version}`;
    $("#updateMessage").textContent = "可以在这里更新；系统会重新构建容器并保留全部制作数据。";
  } else {
    $("#updateTitle").textContent = "当前已经是最新版";
    $("#updateMessage").textContent = `最近检查：${new Date(data.remote.checked_at).toLocaleString("zh-CN")}`;
  }
  if (data.update) {
    const map = { success:"更新成功", failed:"更新失败", running:"正在更新" };
    $("#updateHistory").textContent = `${map[data.update.state] || data.update.state || "状态未知"}\n${data.update.message || ""}\n${data.update.finished_at || data.update.started_at || ""}`.trim();
  }
}
async function checkSystem(silent = false) {
  if (!silent) { $("#latestVersion").textContent = "检查中…"; $("#updateMessage").textContent = "正在连接GitHub检查新版本。"; }
  const data = await api("/api/system/status"); updateSystemView(data); return data;
}
async function openSystem() {
  setActiveArea("system");
  $("#systemModal").classList.remove("hidden");
  try { await checkSystem(); } catch (error) { $("#updateMessage").textContent = error.message; }
}
function closeSystem() { $("#systemModal").classList.add("hidden"); setActiveArea("production"); }
async function requestUpdate() {
  if (!state.system?.remote?.update_available) return;
  if (!confirm(`确认更新到 V${state.system.remote.latest_version}？更新期间页面会短暂断开。`)) return;
  $("#runUpdate").disabled = true;
  try {
    const result = await api("/api/system/update", { method:"POST" });
    toast(result.message); await checkSystem(true);
  } catch (error) { toast(error.message); $("#runUpdate").disabled = false; }
}
$("#openSystem").onclick = openSystem;
$("#closeSystem").onclick = closeSystem;
$("#checkUpdate").onclick = () => checkSystem().catch(error => toast(error.message));
$("#runUpdate").onclick = requestUpdate;
$("#systemModal").onclick = e => { if (e.target === $("#systemModal")) closeSystem(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSystem(); });

loadProjects().catch(e => { if (e.message !== "请先登录") toast(e.message); });
