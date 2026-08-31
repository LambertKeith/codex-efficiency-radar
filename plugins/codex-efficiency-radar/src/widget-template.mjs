import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadWidgetHtml({ previewData = null } = {}) {
  const [template, styles, script] = await Promise.all([
    readFile(path.join(ROOT_DIR, "web", "widget.html"), "utf8"),
    readFile(path.join(ROOT_DIR, "web", "widget.css"), "utf8"),
    readFile(path.join(ROOT_DIR, "web", "widget.js"), "utf8")
  ]);

  const previewBootstrap = previewData
    ? `<script>window.__EFFICIENCY_RADAR_PREVIEW__=${JSON.stringify(previewData).replaceAll("<", "\\u003c")};</script>`
    : "";

  return template
    .replace("/*__WIDGET_CSS__*/", styles)
    .replace("<!--__PREVIEW_BOOTSTRAP__-->", previewBootstrap)
    .replace("/*__WIDGET_JS__*/", script);
}
