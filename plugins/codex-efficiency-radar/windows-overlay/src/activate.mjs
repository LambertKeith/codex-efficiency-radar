import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findCodexMainProcess, locateCodexPackage } from "./package-locator.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(projectRoot, "config.json"), "utf8"));
const installation = await locateCodexPackage(config.packageName, {
  appPaths: config.macAppPaths
});
const running = await findCodexMainProcess(installation.executablePath);

if (running) {
  console.log(`[效率选择器] 检测到普通模式 Codex（PID ${running.processId}）。`);
  console.log("[效率选择器] 请退出当前 Codex；退出后将自动按效率模式重新启动。 ");
  while (await findCodexMainProcess(installation.executablePath)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

await import("./launcher.mjs");
