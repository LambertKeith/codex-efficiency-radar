import assert from "node:assert/strict";
import test from "node:test";

import { loadWidgetHtml } from "../src/widget-template.mjs";

test("组件模板内联资源且不残留占位符", async () => {
  const html = await loadWidgetHtml({
    previewData: { schemaVersion: 1, selectedModel: "demo", models: [] }
  });

  assert.match(html, /智力效率雷达/);
  assert.match(html, /refresh_efficiency_values/);
  assert.doesNotMatch(html, /__WIDGET_(CSS|JS)__/);
  assert.doesNotMatch(html, /__PREVIEW_BOOTSTRAP__/);
});
