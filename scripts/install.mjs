import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins", "codex-efficiency-radar");
const bundlePath = path.join(pluginRoot, "dist", "server.mjs");
const marketplaceName = "codex-efficiency-radar";
const pluginName = "codex-efficiency-radar";
const pluginOnly = process.argv.includes("--plugin-only");
const codex = process.env.CODEX_CLI_PATH || "codex";

async function run(file, args, options = {}) {
  const result = await execFileAsync(file, args, {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    ...options
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  return result;
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

console.log("[1/4] 校验已构建的 MCP 服务器…");
await access(bundlePath);
await run(process.execPath, ["--check", bundlePath]);

console.log("[2/4] 注册本地 Codex 插件 marketplace…");
const marketplaceResult = await execFileAsync(
  codex,
  ["plugin", "marketplace", "list", "--json"],
  { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 }
);
const marketplaces = JSON.parse(marketplaceResult.stdout).marketplaces ?? [];
const existing = marketplaces.find((marketplace) => marketplace.name === marketplaceName);
if (!existing) {
  await run(codex, ["plugin", "marketplace", "add", repoRoot]);
} else if (!samePath(existing.root, repoRoot)) {
  const source = existing.marketplaceSource?.source ?? "";
  const sameRepository = /LambertKeith[\\/]codex-efficiency-radar(?:\.git)?$/i.test(source);
  if (!sameRepository) {
    throw new Error(`marketplace '${marketplaceName}' 已指向其他位置：${existing.root}`);
  }
  await run(codex, ["plugin", "marketplace", "remove", marketplaceName]);
  await run(codex, ["plugin", "marketplace", "add", repoRoot]);
}

console.log("[3/4] 安装 Codex Efficiency Radar 插件…");
await run(codex, ["plugin", "add", `${pluginName}@${marketplaceName}`]);

if (pluginOnly) {
  console.log("[4/4] 已按请求跳过原生选择器增强。");
} else if (process.platform === "darwin") {
  console.log("[4/4] 启用可选 macOS 选择器增强…");
  try {
    await run(process.execPath, [
      path.join(pluginRoot, "scripts", "install-selector-overlay.mjs")
    ]);
  } catch (error) {
    if (error.code === 2) {
      console.warn("插件已安装，但当前 Codex 构建尚未进入选择器兼容白名单。");
    } else {
      throw error;
    }
  }
} else if (process.platform === "win32") {
  console.log("[4/4] 启用可选 Windows 选择器增强…");
  try {
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(pluginRoot, "scripts", "install-selector-overlay.ps1")
    ]);
  } catch (error) {
    if (error.code === 2) {
      console.warn("插件已安装，但当前 Codex 构建尚未进入选择器兼容白名单。");
    } else {
      throw error;
    }
  }
} else {
  console.warn(`[4/4] ${process.platform} 暂无受支持的 Codex 桌面选择器增强；正规插件已安装。`);
}

const installedResult = await execFileAsync(codex, ["plugin", "list", "--json"], {
  cwd: repoRoot,
  maxBuffer: 8 * 1024 * 1024
});
const installed = JSON.parse(installedResult.stdout).installed?.some(
  (plugin) => plugin.pluginId === `${pluginName}@${marketplaceName}` && plugin.installed
);
if (!installed) throw new Error("插件安装验证失败。");
console.log("Codex Efficiency Radar 已安装。重开一个 Codex 任务即可加载正规插件。");
