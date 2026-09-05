import fs from "node:fs/promises";

export function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048 || /[\r\n\0]/.test(raw)) throw new Error("代理地址格式不正确");
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("代理地址格式不正确"); }
  if (!["http:", "https:", "socks5:", "socks5h:"].includes(parsed.protocol)) throw new Error("仅支持HTTP、HTTPS、SOCKS5或SOCKS5H代理");
  if (!parsed.hostname || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) throw new Error("代理地址不能包含路径、查询参数或片段");
  return raw;
}

export function maskProxyUrl(value) {
  if (!value) return "未设置";
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.username || parsed.password ? "***@" : ""}${parsed.host}`;
  } catch { return "已设置"; }
}

export function cleanNetworkError(error, proxyUrl = "") {
  let message = String(error?.message || error || "网络请求失败");
  if (proxyUrl) message = message.split(proxyUrl).join(maskProxyUrl(proxyUrl));
  return message.replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, "//***@");
}

export function publicNetworkSettings(settings) {
  return { enabled:Boolean(settings.enabled), configured:Boolean(settings.proxy_url), display:maskProxyUrl(settings.proxy_url), protocol:settings.proxy_url ? new URL(settings.proxy_url).protocol.replace(":", "").toUpperCase() : null };
}

export async function readNetworkSettings(file) {
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    return { enabled:Boolean(saved?.enabled), proxy_url:String(saved?.proxy_url || "") };
  } catch { return { enabled:false, proxy_url:"" }; }
}

function gitConfigValue(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

export async function writeNetworkSettings(settings, settingsPath, gitConfigPath) {
  const normalized = { enabled:Boolean(settings.enabled), proxy_url:settings.proxy_url ? normalizeProxyUrl(settings.proxy_url) : "", updated_at:new Date().toISOString() };
  await fs.writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode:0o600 });
  await fs.chmod(settingsPath, 0o600);
  const gitConfig = normalized.enabled && normalized.proxy_url ? `[http]\n\tproxy = "${gitConfigValue(normalized.proxy_url)}"\n[https]\n\tproxy = "${gitConfigValue(normalized.proxy_url)}"\n` : "";
  await fs.writeFile(gitConfigPath, gitConfig, { mode:0o600 });
  await fs.chmod(gitConfigPath, 0o600);
  return normalized;
}
