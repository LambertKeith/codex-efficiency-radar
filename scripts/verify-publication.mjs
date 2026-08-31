import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  ".agents/plugins/marketplace.json",
  "plugins/codex-efficiency-radar/.codex-plugin/plugin.json",
  "plugins/codex-efficiency-radar/.mcp.json",
  "plugins/codex-efficiency-radar/dist/server.mjs",
  "plugins/codex-efficiency-radar/windows-overlay/compatibility.json"
];
const ignoredDirectories = new Set([".git", "node_modules", ".preview", "state"]);
const disallowedPatterns = [
  /C:\\Users\\Administrator/i,
  /ADMINI~1/i
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else files.push(entryPath);
  }
  return files;
}

for (const relativePath of required) {
  await readFile(path.join(root, relativePath));
}

for (const filePath of await walk(root)) {
  if (filePath === fileURLToPath(import.meta.url)) continue;
  if (/\.(png|jpg|jpeg|gif|webp|ico)$/i.test(filePath)) continue;
  const content = await readFile(filePath, "utf8");
  for (const pattern of disallowedPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Disallowed local path or legacy identifier in ${path.relative(root, filePath)}`);
    }
  }
}

const marketplace = JSON.parse(await readFile(path.join(root, required[0]), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, required[1]), "utf8"));
if (marketplace.name !== "codex-efficiency-radar") throw new Error("Unexpected marketplace name");
if (manifest.name !== "codex-efficiency-radar") throw new Error("Unexpected plugin name");

console.log("Publication verification passed.");
