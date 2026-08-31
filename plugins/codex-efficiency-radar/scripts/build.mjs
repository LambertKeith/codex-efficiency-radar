import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "dist");
const outputPath = path.join(outputDirectory, "server.mjs");

await mkdir(outputDirectory, { recursive: true });
const result = await build({
  entryPoints: [path.join(root, "mcp", "server.mjs")],
  outfile: outputPath,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  treeShaking: true,
  logLevel: "info",
  write: false
});

const bundle = result.outputFiles.find((file) => path.resolve(file.path) === outputPath);
if (!bundle) {
  throw new Error("esbuild did not produce the expected MCP bundle.");
}
await writeFile(outputPath, bundle.text.replace(/[\t ]+$/gm, ""), "utf8");
