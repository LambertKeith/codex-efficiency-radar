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

test("生成的注入脚本语法有效并包含新旧选择器的矩阵契约", () => {
  const source = buildInjectionSource(snapshot);
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /OVERLAY_VERSION = 6/);
  assert.match(source, /role=\"menu\"/);
  assert.match(source, /data-model-picker-view/);
  assert.match(source, /data-codex-efficiency-root/);
  assert.match(source, /data-codex-efficiency-entry/);
  assert.match(source, /data-codex-efficiency-panel/);
  assert.match(source, /data-codex-efficiency-table/);
  assert.match(source, /data-codex-efficiency-refresh/);
  assert.match(source, /查看效率值/);
  assert.match(source, /刷新效率值/);
  assert.match(source, /效率值矩阵/);
  assert.match(source, /综合智能 \/ 软件工程/);
  assert.match(source, /font-size: 15px/);
  assert.match(source, /min-width: 680px/);
  assert.match(source, /width: min\(760px, calc\(100vw - 32px\)\)/);
  assert.match(source, /综合智能/);
  assert.match(source, /软件工程/);
});

test("注入脚本转义 HTML 起始字符", () => {
  const source = buildInjectionSource({ ...snapshot, warning: "</script>" });
  assert.doesNotMatch(source, /<\/script>/);
  assert.match(source, /\\u003c\/script>/);
});
