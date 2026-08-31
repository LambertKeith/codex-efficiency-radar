import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins", "codex-efficiency-radar");
const marketplaceName = "codex-efficiency-radar";
const pluginId = "codex-efficiency-radar@codex-efficiency-radar";
const keepMarketplace = process.argv.includes("--keep-marketplace");
const codex = process.env.CODEX_CLI_PATH || "codex";

async function run(file, args) {
  const result = await execFileAsync(file, args, {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  return result;
}

if (process.platform === "darwin") {
  await run(process.execPath, [
    path.join(pluginRoot, "scripts", "uninstall-selector-overlay.mjs")
  ]);
} else if (process.platform === "win32") {
  await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(pluginRoot, "scripts", "uninstall-selector-overlay.ps1")
  ]);
}

const pluginList = JSON.parse(
  (await execFileAsync(codex, ["plugin", "list", "--json"], {
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024
  })).stdout
);
if (pluginList.installed?.some((plugin) => plugin.pluginId === pluginId && plugin.installed)) {
  await run(codex, ["plugin", "remove", pluginId]);
}

if (!keepMarketplace) {
  const marketplaceList = JSON.parse(
    (await execFileAsync(codex, ["plugin", "marketplace", "list", "--json"], {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024
    })).stdout
  );
  const marketplace = marketplaceList.marketplaces?.find(
    (candidate) => candidate.name === marketplaceName
  );
  const source = marketplace?.marketplaceSource?.source ?? "";
  const sameRepository =
    marketplace?.root && path.resolve(marketplace.root) === path.resolve(repoRoot) ||
    /LambertKeith[\\/]codex-efficiency-radar(?:\.git)?$/i.test(source);
  if (marketplace && sameRepository) {
    await run(codex, ["plugin", "marketplace", "remove", marketplaceName]);
  }
}
console.log("Codex Efficiency Radar 已卸载。重启 Codex 以清理当前界面状态。");
