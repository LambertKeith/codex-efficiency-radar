import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins", "codex-efficiency-radar");
const bundlePath = path.join(pluginRoot, "dist", "server.mjs");
const marketplaceName = "codex-efficiency-radar";
const pluginName = "codex-efficiency-radar";
const codex = process.env.CODEX_CLI_PATH || "codex";
const arguments_ = process.argv.slice(2);

if (arguments_.length > 0) {
  console.error(`不支持安装参数：${arguments_.join(" ")}。原生模型选择器增强是必需组件。`);
  process.exit(64);
}
if (!new Set(["darwin", "win32"]).has(process.platform)) {
  console.error(`当前平台 ${process.platform} 不支持必需的原生模型选择器增强，未修改插件状态。`);
  process.exit(20);
}

const pluginManifest = JSON.parse(
  await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8")
);
const overlayLauncher = path.join(
  pluginRoot,
  "windows-overlay",
  "src",
  "launcher.mjs"
);

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

async function isManagedMarketplaceCopy(root) {
  try {
    const marketplace = JSON.parse(
      await readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8")
    );
    const manifest = JSON.parse(
      await readFile(
        path.join(root, "plugins", pluginName, ".codex-plugin", "plugin.json"),
        "utf8"
      )
    );
    const repository = String(manifest.repository ?? "")
      .replace(/\.git$/i, "")
      .replace(/\/$/, "");
    return (
      marketplace.name === marketplaceName &&
      manifest.name === pluginName &&
      repository.toLowerCase() ===
        "https://github.com/lambertkeith/codex-efficiency-radar".toLowerCase()
    );
  } catch {
    return false;
  }
}

console.log("[1/5] 校验已构建的 MCP 服务器…");
await access(bundlePath);
await run(process.execPath, ["--check", bundlePath]);

console.log("[2/5] 预检必需的原生模型选择器增强…");
await run(process.execPath, [overlayLauncher, "--diagnose"]);

console.log("[3/5] 注册本地 Codex 插件 marketplace…");
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
  const sameRepository =
    /LambertKeith[\\/]codex-efficiency-radar(?:\.git)?$/i.test(source) ||
    await isManagedMarketplaceCopy(existing.root);
  if (!sameRepository) {
    throw new Error(`marketplace '${marketplaceName}' 已指向其他位置：${existing.root}`);
  }
  await run(codex, ["plugin", "marketplace", "remove", marketplaceName]);
  await run(codex, ["plugin", "marketplace", "add", repoRoot]);
}

console.log("[4/5] 安装 Codex Efficiency Radar 正规插件…");
await run(codex, ["plugin", "add", `${pluginName}@${marketplaceName}`]);

const installedResult = await execFileAsync(codex, ["plugin", "list", "--json"], {
  cwd: repoRoot,
  maxBuffer: 8 * 1024 * 1024
});
const installed = JSON.parse(installedResult.stdout).installed?.find(
  (plugin) => plugin.pluginId === `${pluginName}@${marketplaceName}`
);
if (
  !installed?.installed ||
  !installed?.enabled ||
  installed.version !== pluginManifest.version
) {
  throw new Error(
    `正规插件安装验证失败：期望启用版本 ${pluginManifest.version}，实际 ${installed?.version ?? "missing"}`
  );
}

console.log("[5/5] 安装并验证必需的原生模型选择器增强…");
if (process.platform === "darwin") {
  await run(process.execPath, [
    path.join(pluginRoot, "scripts", "install-selector-overlay.mjs")
  ]);
} else {
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(pluginRoot, "scripts", "install-selector-overlay.ps1")
  ]);
}

console.log(
  `Codex Efficiency Radar ${pluginManifest.version} 完整安装成功：正规插件已启用，` +
  "Codex 已处于增强模式，真实模型选择器中的效率入口与数值已经过端到端验证。"
);
