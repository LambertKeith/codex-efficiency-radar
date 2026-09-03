import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

import {
  assertUiHeartbeatEvidence,
  assertUiVerificationEvidence,
  buildUiHeartbeatSource,
  buildUiVerificationSource
} from "../src/ui-verification.mjs";

test("真实模型选择器中的效率入口和数值构成端到端完成证据", async () => {
  const { window, document } = parseHTML(`
    <button data-codex-intelligence-trigger="true" aria-expanded="true">模型</button>
    <div data-codex-efficiency-root="true">
      <button data-codex-efficiency-entry="true" aria-expanded="true">
        <span class="codex-efficiency-entry-label">效率</span>
      </button>
      <div data-codex-efficiency-panel="true">
        <button data-codex-efficiency-option="true" data-model-id="gpt-5.6-sol" data-effort-id="high">
          <span class="codex-efficiency-score">98</span>
          <span class="codex-efficiency-score">97</span>
        </button>
      </div>
    </div>
  `);
  window.__codexEfficiencyRadarOverlay = {
    snapshot: {
      models: [{
        id: "gpt-5.6-sol",
        efforts: [{ id: "high", comprehensiveIq: 98, softwareIq: 97 }]
      }],
      source: { checkedAt: "2026-09-03T00:00:00.000Z" }
    }
  };
  const evaluate = new Function(
    "window",
    "document",
    "setTimeout",
    `return ${buildUiVerificationSource(1000)};`
  );

  const evidence = await evaluate(window, document, setTimeout);
  assert.deepEqual(assertUiVerificationEvidence(evidence), {
    ok: true,
    entryLabel: "效率",
    modelCount: 1,
    optionCount: 1,
    numericScoreCount: 2,
    expectedValueCount: 2,
    valuesMatchSnapshot: true,
    checkedAt: "2026-09-03T00:00:00.000Z"
  });
});

test("缺少入口或完整数值对时不能报告安装成功", () => {
  assert.throws(
    () => assertUiVerificationEvidence({ ok: false, reason: "未找到入口" }),
    /未找到入口/
  );
  assert.throws(
    () => assertUiVerificationEvidence({
      ok: true,
      entryLabel: "效率",
      modelCount: 1,
      optionCount: 1,
      numericScoreCount: 1,
      expectedValueCount: 1,
      valuesMatchSnapshot: true
    }),
    /完整的数值对/
  );
});

test("上一轮通过后效率 DOM 消失，下一轮持续验证必须失败", async () => {
  const { window, document } = parseHTML(`
    <button data-codex-intelligence-trigger="true" aria-expanded="true">模型</button>
    <div data-model-picker-view="true">
      <div data-codex-efficiency-root="true">
        <button data-codex-efficiency-entry="true" aria-expanded="true">
          <span class="codex-efficiency-entry-label">效率</span>
        </button>
        <div data-codex-efficiency-panel="true">
          <button data-codex-efficiency-option="true" data-model-id="gpt-5.6-sol" data-effort-id="high">
            <span class="codex-efficiency-score">98</span>
            <span class="codex-efficiency-score">97</span>
          </button>
        </div>
      </div>
    </div>
  `);
  window.__codexEfficiencyRadarOverlay = {
    snapshot: {
      models: [{
        id: "gpt-5.6-sol",
        efforts: [{ id: "high", comprehensiveIq: 98, softwareIq: 97 }]
      }],
      source: { checkedAt: "2026-09-03T00:00:00.000Z" }
    }
  };
  const evaluate = (timeoutMs) => new Function(
    "window",
    "document",
    "setTimeout",
    `return ${buildUiVerificationSource(timeoutMs)};`
  )(window, document, setTimeout);

  assert.equal((await evaluate(100)).ok, true);
  document.querySelector("[data-codex-efficiency-root]").remove();

  const missing = await evaluate(50);
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /效率入口或数值面板未在模型选择器中就绪/);
});

test("被动心跳在选择器关闭时不打开 UI，打开时核验效率数值 DOM", () => {
  const { window, document } = parseHTML(`
    <button data-codex-intelligence-trigger="true" aria-expanded="false">模型</button>
  `);
  window.__codexEfficiencyRadarSelector = {};
  window.__codexEfficiencyRadarOverlay = {
    snapshot: {
      models: [{
        id: "gpt-5.6-sol",
        efforts: [{ id: "high", comprehensiveIq: 98, softwareIq: 97 }]
      }],
      source: { checkedAt: "2026-09-03T00:00:00.000Z" }
    }
  };
  const evaluate = () => new Function(
    "window",
    "document",
    `return ${buildUiHeartbeatSource()};`
  )(window, document);

  assert.deepEqual(assertUiHeartbeatEvidence(evaluate()), {
    ok: true,
    selectorOpen: false,
    mode: "runtime",
    modelCount: 1,
    checkedAt: "2026-09-03T00:00:00.000Z"
  });

  const picker = document.createElement("div");
  picker.setAttribute("data-model-picker-view", "true");
  picker.getBoundingClientRect = () => ({ width: 100, height: 100 });
  document.body.append(picker);
  assert.throws(
    () => assertUiHeartbeatEvidence(evaluate()),
    /缺少效率入口、档位或完整数值 DOM/
  );
});

test("v1 trigger 状态未同步时仍识别模型菜单，且不误判普通 role=menu", () => {
  const { window, document } = parseHTML(`
    <button data-codex-intelligence-trigger="true" aria-expanded="false" data-state="closed">
      GPT-5.6 Sol
    </button>
    <div role="menu" id="legacy-model-picker">
      <div role="menuitem"><span data-model-picker-model-row>GPT-5.6 Sol</span></div>
      <div role="menuitem" data-reasoning-selected="true">推理强度 高</div>
    </div>
    <div role="menu" id="ordinary-menu">
      <div role="menuitem">低</div><div role="menuitem">中</div><div role="menuitem">高</div>
    </div>
  `);
  window.__codexEfficiencyRadarSelector = {
    identifyModel(text) {
      return /5\.6 Sol/i.test(text ?? "") ? { id: "gpt-5.6-sol" } : null;
    }
  };
  window.__codexEfficiencyRadarOverlay = {
    snapshot: {
      models: [{
        id: "gpt-5.6-sol",
        efforts: [{ id: "high", comprehensiveIq: 98, softwareIq: 97 }]
      }],
      source: { checkedAt: "2026-09-03T00:00:00.000Z" }
    }
  };
  const visibleRect = () => ({ width: 100, height: 100 });
  document.querySelector("#legacy-model-picker").getBoundingClientRect = visibleRect;
  document.querySelector("#ordinary-menu").getBoundingClientRect = visibleRect;
  const evaluate = () => new Function(
    "window",
    "document",
    `return ${buildUiHeartbeatSource()};`
  )(window, document);

  assert.throws(
    () => assertUiHeartbeatEvidence(evaluate()),
    /缺少效率入口、档位或完整数值 DOM/
  );

  document.querySelector("#legacy-model-picker").remove();
  assert.deepEqual(assertUiHeartbeatEvidence(evaluate()), {
    ok: true,
    selectorOpen: false,
    mode: "runtime",
    modelCount: 1,
    checkedAt: "2026-09-03T00:00:00.000Z"
  });
});

test("Codex 首次渲染关闭模型菜单后，验收会重新打开并取得完整证据", async () => {
  const { window, document } = parseHTML(`
    <button data-codex-intelligence-trigger="true" aria-expanded="false">模型</button>
  `);
  window.__codexEfficiencyRadarOverlay = {
    snapshot: {
      models: [{
        id: "gpt-5.6-sol",
        efforts: [{ id: "high", comprehensiveIq: 98, softwareIq: 97 }]
      }],
      source: { checkedAt: "2026-09-03T00:00:00.000Z" }
    }
  };
  const trigger = document.querySelector("[data-codex-intelligence-trigger]");
  let openCount = 0;
  trigger.addEventListener("click", () => {
    openCount += 1;
    if (openCount === 1) {
      trigger.setAttribute("aria-expanded", "true");
      setTimeout(() => trigger.setAttribute("aria-expanded", "false"), 20);
      return;
    }
    // 当前 Codex 构建不会稳定同步 aria-expanded；真实选择器 DOM 才是打开证据。
    const root = document.createElement("div");
    root.setAttribute("data-codex-efficiency-root", "true");
    root.innerHTML = `
      <button data-codex-efficiency-entry="true" aria-expanded="true">
        <span class="codex-efficiency-entry-label">效率</span>
      </button>
      <div data-codex-efficiency-panel="true">
        <button data-codex-efficiency-option="true" data-model-id="gpt-5.6-sol" data-effort-id="high">
          <span class="codex-efficiency-score">98</span>
          <span class="codex-efficiency-score">97</span>
        </button>
      </div>
    `;
    document.body.append(root);
  });
  const evaluate = new Function(
    "window",
    "document",
    "setTimeout",
    `return ${buildUiVerificationSource(1200)};`
  );

  const evidence = await evaluate(window, document, setTimeout);
  assert.equal(evidence.ok, true);
  assert.equal(openCount, 3);
  assert.equal(evidence.numericScoreCount, 2);
  assert.equal(evidence.valuesMatchSnapshot, true);
});
