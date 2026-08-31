import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

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

test("真实 DOM 场景会添加两类徽标和刷新桥接", async () => {
  const { window, document } = parseHTML(`
    <html><head></head><body>
      <button data-codex-intelligence-trigger="true" data-selected-reasoning-effort="xhigh">
        5.6 Sol 极高
      </button>
      <div role="menu" id="root-menu">
        <button role="menuitem" class="invisible fixed"></button>
        <div role="menuitem" class="native-menu-item text-sm">模型 5.6 Sol</div>
        <div role="menuitem" class="native-menu-item text-sm">推理强度 极高</div>
        <div role="menuitem" class="native-menu-item text-sm">高级</div>
      </div>
      <div role="menu" id="effort-menu">
        <div role="menuitemradio"><div>高</div></div>
        <div role="menuitemradio"><div>极高</div></div>
      </div>
    </body></html>
  `);
  let refreshCalls = 0;
  window.codexEfficiencyRefresh = () => { refreshCalls += 1; };
  const run = new Function("window", "document", "MutationObserver", "requestAnimationFrame", buildInjectionSource(snapshot));
  run(window, document, window.MutationObserver, (callback) => callback());
  await new Promise((resolve) => setTimeout(resolve, 0));

  const badges = document.querySelectorAll("[data-codex-efficiency-badges]");
  assert.equal(badges.length, 2);
  assert.equal(badges[0].textContent, "综 98工 97");
  assert.equal(badges[1].textContent, "综 104工 101");
  assert.equal(badges[0].parentElement.getAttribute("data-codex-efficiency-row"), "true");
  assert.equal(badges[1].parentElement.getAttribute("data-codex-efficiency-row"), "true");

  const refreshButton = document.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(refreshButton?.textContent, "刷新效率值");
  assert.equal(refreshButton.className, "native-menu-item text-sm");
  refreshButton.click();
  assert.equal(refreshCalls, 1);
  assert.equal(refreshButton.textContent, "正在刷新效率值…");
});
