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
        { id: "high", comprehensiveIq: 98, softwareIq: 97 },
        { id: "xhigh", comprehensiveIq: 104, softwareIq: 101 }
      ]
    }
  ],
  source: { checkedAt: "2026-08-31T00:00:00.000Z" }
};

test("生成的注入脚本语法有效并包含关键契约", () => {
  const source = buildInjectionSource(snapshot);
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /data-codex-intelligence-trigger/);
  assert.match(source, /刷新效率值/);
  assert.match(source, /综合智能/);
  assert.match(source, /软件工程能力/);
  assert.match(source, /data-codex-efficiency-row/);
  assert.match(source, /flex-direction: row !important/);
});

test("注入脚本转义 HTML 起始字符", () => {
  const source = buildInjectionSource({ ...snapshot, warning: "</script>" });
  assert.doesNotMatch(source, /<\/script>/);
  assert.match(source, /\\u003c\/script>/);
});
