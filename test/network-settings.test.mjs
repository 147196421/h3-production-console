import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanNetworkError, normalizeProxyUrl, publicNetworkSettings, readNetworkSettings, writeNetworkSettings } from "../network-settings.mjs";

test("代理协议和地址格式受到限制", () => {
  assert.equal(normalizeProxyUrl("socks5://user:pass@127.0.0.1:1080"), "socks5://user:pass@127.0.0.1:1080");
  assert.equal(normalizeProxyUrl("https://proxy.example.com:443"), "https://proxy.example.com:443");
  assert.throws(() => normalizeProxyUrl("ftp://proxy.example.com"), /仅支持/);
  assert.throws(() => normalizeProxyUrl("socks5://proxy.example.com/path"), /不能包含路径/);
  assert.throws(() => normalizeProxyUrl("socks5://proxy.example.com\nmalicious"), /格式不正确/);
});

test("代理秘密只保存在data文件且公开状态始终脱敏", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "h3-network-"));
  const settingsPath = path.join(dataDir, "network-settings.json");
  const gitConfigPath = path.join(dataDir, "git-proxy.config");
  const secretProxy = "socks5://unit-user:unit-password@127.0.0.1:1080";
  try {
    const saved = await writeNetworkSettings({ enabled:true, proxy_url:secretProxy }, settingsPath, gitConfigPath);
    const publicView = publicNetworkSettings(saved);
    assert.equal(publicView.display, "socks5://***@127.0.0.1:1080");
    assert.doesNotMatch(JSON.stringify(publicView), /unit-user|unit-password/);
    assert.deepEqual(await readNetworkSettings(settingsPath), { enabled:true, proxy_url:secretProxy });
    assert.match(await fs.readFile(settingsPath, "utf8"), /unit-password/);
    assert.match(await fs.readFile(gitConfigPath, "utf8"), /unit-password/);
    assert.equal((await fs.stat(settingsPath)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(gitConfigPath)).mode & 0o777, 0o600);
    assert.doesNotMatch(cleanNetworkError(new Error(`failed via ${secretProxy}`), secretProxy), /unit-user|unit-password/);
    await writeNetworkSettings({ enabled:false, proxy_url:"" }, settingsPath, gitConfigPath);
    assert.equal(await fs.readFile(gitConfigPath, "utf8"), "");
  } finally { await fs.rm(dataDir, { recursive:true, force:true }); }
});
