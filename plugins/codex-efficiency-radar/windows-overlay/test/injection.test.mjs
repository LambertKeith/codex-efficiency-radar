import assert from "node:assert/strict";
import test from "node:test";

import { buildInjectionSource } from "../src/injection-script.mjs";

const snapshot = {
  models: [
    {
      id: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      shortLabel: "5.6 Sol",
      efforts: [
        { id: "high", label: "高", comprehensiveIq: 98, softwareIq: 97 },
        { id: "xhigh", label: "极高", comprehensiveIq: 104, softwareIq: 101 }
      ]
    }
  ],
  source: { checkedAt: "2026-08-31T00:00:00.000Z" }
};

test("生成的注入脚本语法有效并包含能力地图与原生选择契约", () => {
  const source = buildInjectionSource(snapshot, "data-model-picker-view-v2");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /OVERLAY_VERSION = 7/);
  assert.match(source, /BRIDGE_VERSION = 1/);
  assert.match(source, /data-model-picker-view-v2/);
  assert.match(source, /role=\"menu\"/);
  assert.match(source, /data-model-picker-view/);
  assert.match(source, /data-codex-efficiency-root/);
  assert.match(source, /data-codex-efficiency-entry/);
  assert.match(source, /data-codex-efficiency-panel/);
  assert.match(source, /data-codex-efficiency-grid/);
  assert.match(source, /data-codex-efficiency-option/);
  assert.match(source, /data-codex-efficiency-refresh/);
  assert.match(source, /查看效率地图/);
  assert.match(source, /刷新效率值/);
  assert.match(source, /效率能力地图/);
  assert.match(source, /点击任意组合即可切换/);
  assert.match(source, /达到该模型峰值 95% 的最低档位/);
  assert.match(source, /综合智能 \/ 软件工程/);
  assert.match(source, /font-size: 16px/);
  assert.match(source, /--cer-map-width/);
  assert.match(source, /width: min\(760px, calc\(100vw - 32px\)\)/);
  assert.match(source, /data-reasoning-slider/);
  assert.match(source, /data-model-picker-model-row/);
});

test("注入脚本转义 HTML 起始字符", () => {
  const source = buildInjectionSource({ ...snapshot, warning: "</script>" });
  assert.doesNotMatch(source, /<\/script>/);
  assert.match(source, /\\u003c\/script>/);
});
