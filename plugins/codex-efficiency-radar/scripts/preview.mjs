import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RadarClient } from "../src/radar-client.mjs";
import { loadWidgetHtml } from "../src/widget-template.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, ".preview");
const outputPath = path.join(outputDirectory, "index.html");

const client = new RadarClient();
const snapshot = await client.getSnapshot({ force: false });
const html = await loadWidgetHtml({ previewData: snapshot });

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, html, "utf8");
console.log(outputPath);
