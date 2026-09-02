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
        { id: "high", label: "高", order: 30, comprehensiveIq: 98, softwareIq: 97 },
        { id: "xhigh", label: "极高", order: 40, comprehensiveIq: 104, softwareIq: 101 }
      ]
    },
    {
      id: "gpt-5.6-terra",
      label: "GPT-5.6 Terra",
      shortLabel: "5.6 Terra",
      efforts: [
        { id: "low", label: "轻度", order: 10, comprehensiveIq: 81, softwareIq: 84 },
        { id: "high", label: "高", order: 30, comprehensiveIq: 94, softwareIq: 96 },
        { id: "xhigh", label: "极高", order: 40, comprehensiveIq: 100, softwareIq: 99 }
      ]
    }
  ],
  source: { checkedAt: "2026-08-31T00:00:00.000Z" }
};

const updatedSnapshot = {
  ...snapshot,
  models: snapshot.models.map((model) =>
    model.id === "gpt-5.6-sol"
      ? {
          ...model,
          efforts: model.efforts.map((effort) =>
            effort.id === "high"
              ? { ...effort, comprehensiveIq: 109, softwareIq: 108 }
              : effort
          )
        }
      : model
  ),
  source: { checkedAt: "2026-09-01T00:00:00.000Z" }
};

function createDom(body) {
  const dom = parseHTML(`<html><head></head><body>${body}</body></html>`);
  delete dom.window.__codexEfficiencyRadarOverlay;
  delete dom.window.__codexEfficiencyRadarSelector;
  delete dom.window.codexEfficiencyRefresh;
  return dom;
}

class TestMutationObserver {
  observe() {}
  disconnect() {}
}

function install(window, document, nextSnapshot = snapshot, clock = {}) {
  const run = new Function(
    "window",
    "document",
    "MutationObserver",
    "requestAnimationFrame",
    "setTimeout",
    "clearTimeout",
    buildInjectionSource(nextSnapshot, clock.selectorContract ?? "auto")
  );
  run(
    window,
    document,
    clock.MutationObserver ?? TestMutationObserver,
    clock.requestAnimationFrame ?? ((callback) => callback()),
    clock.setTimeout ?? setTimeout,
    clock.clearTimeout ?? clearTimeout
  );
}

async function settle(delay = 0) {
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function assertEntryAtBottom(host) {
  const root = host.lastElementChild;
  assert.equal(root?.getAttribute("data-codex-efficiency-root"), "true");
  const entry = root.querySelector("[data-codex-efficiency-entry]");
  assert.match(entry?.textContent ?? "", /查看效率地图/);
  assert.equal(entry?.getAttribute("aria-expanded"), "false");
  assert.equal(root.querySelector("[data-codex-efficiency-panel]")?.hidden, true);
}

test("旧版根菜单、推理子菜单和模型子菜单底部均有独立入口", async () => {
  const { window, document } = createDom(`
    <button aria-expanded="true" data-codex-intelligence-trigger="true" data-selected-reasoning-effort="xhigh">
      5.6 Sol 极高
    </button>
    <div role="menu" id="root-menu">
      <button role="menuitem" class="invisible fixed"></button>
      <div role="menuitem" class="native-menu-item">模型 5.6 Sol</div>
      <div role="menuitem" class="native-menu-item">推理强度 极高</div>
    </div>
    <div role="menu" id="effort-menu">
      <div role="menuitemradio" data-codex-efficiency-row="true">
        <div>高</div><span data-codex-efficiency-badges></span>
      </div>
      <div role="menuitemradio"><div>极高</div></div>
    </div>
    <div role="menu" id="model-menu">
      <div role="menuitemradio"><div>GPT-5.6 Sol</div></div>
      <div role="menuitemradio"><div>GPT-5.6 Terra</div></div>
    </div>
  `);

  install(window, document);
  await settle();

  assert.equal(document.querySelectorAll("[data-codex-efficiency-entry]").length, 3);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-badges]").length, 0);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-row]").length, 0);
  assertEntryAtBottom(document.querySelector("#root-menu"));
  assertEntryAtBottom(document.querySelector("#effort-menu"));
  assertEntryAtBottom(document.querySelector("#model-menu"));
});

test("模型选择器关闭时不会误注入普通低中高菜单", async () => {
  const { window, document } = createDom(`
    <button aria-expanded="false" data-codex-intelligence-trigger="true">GPT-5.6 Sol</button>
    <div role="menu" id="unrelated-menu">
      <div role="menuitem">低</div><div role="menuitem">中</div><div role="menuitem">高</div>
    </div>
  `);
  install(window, document);
  await settle();
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 0);
});

test("新版 simple 和 advanced 共用外层菜单底部的单一入口", async () => {
  const { window, document } = createDom(`
    <div role="menu" id="picker-menu">
      <div data-model-picker-view="simple">
        <div data-model-picker-track="simple"><section><button>GPT-5.6 Sol</button></section></div>
        <div data-model-picker-track="advanced"><section><button>GPT-5.6 Terra</button></section></div>
      </div>
    </div>
  `);
  install(window, document);
  await settle();

  const menu = document.querySelector("#picker-menu");
  assert.equal(document.querySelectorAll("[data-codex-efficiency-entry]").length, 1);
  assertEntryAtBottom(menu);
  assert.equal(menu.querySelector("[data-model-picker-view] [data-codex-efficiency-root]"), null);
  assert.equal(menu.lastElementChild.getAttribute("role"), "none");
  assert.equal(menu.querySelector("[data-codex-efficiency-entry]").getAttribute("role"), "menuitem");
});

test("动画帧暂停时仍通过微任务挂载新版入口", async () => {
  const { window, document } = createDom(`
    <div role="menu" id="picker-menu"><div data-model-picker-view="simple"></div></div>
  `);
  let frameCalls = 0;
  install(window, document, snapshot, {
    requestAnimationFrame: () => { frameCalls += 1; }
  });
  await settle();

  assert.equal(frameCalls, 0);
  assertEntryAtBottom(document.querySelector("#picker-menu"));
});

test("旧版复用弹层仅切换原生状态属性时会补挂入口", async () => {
  const { window, document } = createDom(`
    <button data-codex-intelligence-trigger="true" data-state="closed">5.6 Sol</button>
    <div role="menu" id="picker-menu">
      <button role="menuitemradio">高</button>
      <button role="menuitemradio">极高</button>
    </div>
  `);
  install(window, document, snapshot, { MutationObserver: window.MutationObserver });
  await settle();
  assert.equal(document.querySelector("[data-codex-efficiency-root]"), null);

  document.querySelector("[data-codex-intelligence-trigger]").dataset.state = "open";
  await settle();
  await settle();

  assertEntryAtBottom(document.querySelector("#picker-menu"));
  window.__codexEfficiencyRadarOverlay.observer.disconnect();
});

test("内部 ViewPanel 替换不会移动入口或产生重复节点", async () => {
  const { window, document } = createDom(`
    <div role="menu" id="picker-menu">
      <div data-model-picker-view="simple">
        <div id="picker-track"><section id="old-panel"><button>选择模型</button></section></div>
      </div>
    </div>
  `);
  install(window, document, snapshot, {
    MutationObserver: window.MutationObserver,
    requestAnimationFrame: (callback) => setTimeout(callback, 0)
  });
  await settle();
  const menu = document.querySelector("#picker-menu");
  assertEntryAtBottom(menu);

  const replacement = document.createElement("section");
  replacement.id = "new-panel";
  replacement.innerHTML = "<button>选择模型</button>";
  document.querySelector("#picker-track").replaceChildren(replacement);
  await settle();
  await settle();

  assert.equal(document.querySelector("#old-panel"), null);
  assertEntryAtBottom(menu);
  assert.equal(replacement.querySelector("[data-codex-efficiency-root]"), null);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
  window.__codexEfficiencyRadarOverlay.observer.disconnect();
});

test("入口展开为模型卡片能力地图并按相对规则标出优选", async () => {
  const { window, document } = createDom(`
    <div role="menu" id="picker-menu"><div data-model-picker-view="simple"></div></div>
  `);
  install(window, document);
  await settle();
  const entry = document.querySelector("[data-codex-efficiency-entry]");
  const panel = document.querySelector("[data-codex-efficiency-panel]");
  entry.click();

  assert.equal(entry.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hidden, false);
  assert.equal(document.querySelector("#picker-menu").getAttribute("data-codex-efficiency-expanded"), "true");
  assert.match(panel.querySelector(".codex-efficiency-panel-heading").textContent, /效率能力地图/);
  assert.match(panel.querySelector(".codex-efficiency-panel-heading").textContent, /点击任意组合即可切换/);

  const grid = panel.querySelector("[data-codex-efficiency-grid]");
  assert.equal(grid.getAttribute("role"), "grid");
  assert.equal(grid.querySelector('[role="columnheader"]'), null);
  const rows = [...grid.querySelectorAll(".codex-efficiency-map-row")];
  assert.equal(rows.length, 2);
  const solHigh = grid.querySelector('[data-model-id="gpt-5.6-sol"][data-effort-id="high"]');
  const solXHigh = grid.querySelector('[data-model-id="gpt-5.6-sol"][data-effort-id="xhigh"]');
  const terraLow = grid.querySelector('[data-model-id="gpt-5.6-terra"][data-effort-id="low"]');
  assert.match(solHigh.textContent, /优选.*综合98.*工程97/);
  assert.equal(solHigh.dataset.valuePick, "true");
  assert.equal(solXHigh.dataset.valuePick, "false");
  assert.equal(terraLow.dataset.valuePick, "false");
  assert.match(solHigh.querySelector(".codex-efficiency-option-head").textContent, /高HIGH/);
  assert.equal(grid.querySelector(".codex-efficiency-empty"), null);
  assert.match(panel.querySelector(".codex-efficiency-map-legend").textContent, /推理档位为成本代理.*95%/);
  assert.equal(panel.querySelector("table"), null);

  entry.click();
  assert.equal(panel.hidden, true);
  assert.equal(document.querySelector("#picker-menu").hasAttribute("data-codex-efficiency-expanded"), false);
});

test("点击新版能力项通过原生模型行和 Power 控件切换组合", async () => {
  const { window, document } = createDom(`
    <div role="menu" id="picker-menu">
      <div data-model-picker-view="simple" id="picker">
        <div id="simple-track">
          <button data-model-picker-view-toggle>5.6 Sol 高</button>
          <span id="power-status" role="status">5.6 Sol Extended, 1 of 2.</span>
          <button data-reasoning-slider aria-describedby="power-status">Power</button>
        </div>
        <div id="advanced-track" inert aria-hidden="true">
          <button role="menuitemradio">GPT-5.6 Sol</button>
          <button id="terra-row" role="menuitemradio">GPT-5.6 Terra</button>
        </div>
      </div>
    </div>
  `);
  const picker = document.querySelector("#picker");
  const toggle = picker.querySelector("[data-model-picker-view-toggle]");
  const advanced = document.querySelector("#advanced-track");
  const status = document.querySelector("#power-status");
  const slider = picker.querySelector("[data-reasoning-slider]");
  const nativeEvents = [];
  toggle.addEventListener("click", () => {
    picker.setAttribute("data-model-picker-view", "advanced");
    advanced.removeAttribute("inert");
    advanced.removeAttribute("aria-hidden");
  });
  document.querySelector("#terra-row").addEventListener("click", () => {
    nativeEvents.push("model:terra");
    status.textContent = "5.6 Terra Light, 1 of 2.";
    toggle.textContent = "5.6 Terra 轻度";
    picker.setAttribute("data-model-picker-view", "simple");
    advanced.setAttribute("inert", "");
    advanced.setAttribute("aria-hidden", "true");
  });
  slider.addEventListener("keydown", (event) => {
    nativeEvents.push(event.key);
    if (event.key === "ArrowRight") {
      status.textContent = "5.6 Terra High, 2 of 2.";
      toggle.textContent = "5.6 Terra 高";
    }
  });

  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();
  const target = document.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-terra"][data-effort-id="high"]'
  );
  target.click();
  await settle(30);

  assert.deepEqual(nativeEvents, ["model:terra", "ArrowRight", "Enter"]);
  assert.equal(status.textContent, "5.6 Terra High, 2 of 2.");
  assert.equal(target.dataset.selected, "true");
  assert.equal(target.getAttribute("aria-pressed"), "true");
  assert.match(document.querySelector("[data-codex-efficiency-status]").textContent, /已切换到 GPT-5.6 Terra · 高/);
});

test("从新版 advanced 界面点击同模型档位会先返回原生 Power 界面", async () => {
  const { window, document } = createDom(`
    <div role="menu">
      <div data-model-picker-view="advanced" id="picker">
        <div id="simple-track" inert aria-hidden="true">
          <button data-model-picker-view-toggle>5.6 Sol 高</button>
          <span id="power-status" role="status">5.6 Sol Extended, 1 of 2.</span>
          <button data-reasoning-slider aria-describedby="power-status">Power</button>
        </div>
        <div id="advanced-track">
          <button id="sol-row" role="menuitemradio" data-model-selected="true">GPT-5.6 Sol</button>
          <button role="menuitemradio">GPT-5.6 Terra</button>
        </div>
      </div>
    </div>
  `);
  const picker = document.querySelector("#picker");
  const simple = document.querySelector("#simple-track");
  const advanced = document.querySelector("#advanced-track");
  const status = document.querySelector("#power-status");
  const slider = picker.querySelector("[data-reasoning-slider]");
  const events = [];
  document.querySelector("#sol-row").addEventListener("click", () => {
    events.push("return:simple");
    picker.setAttribute("data-model-picker-view", "simple");
    simple.removeAttribute("inert");
    simple.removeAttribute("aria-hidden");
    advanced.setAttribute("inert", "");
    advanced.setAttribute("aria-hidden", "true");
  });
  slider.addEventListener("keydown", (event) => {
    events.push(event.key);
    if (event.key === "ArrowRight") status.textContent = "5.6 Sol Extra High, 2 of 2.";
  });

  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();
  document.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-sol"][data-effort-id="xhigh"]'
  ).click();
  await settle(30);

  assert.deepEqual(events, ["return:simple", "ArrowRight", "Enter"]);
  assert.equal(status.textContent, "5.6 Sol Extra High, 2 of 2.");
});

test("新版单档模型没有可用 Power 控件时以原生触发器回读并关闭", async () => {
  const { window, document } = createDom(`
    <button id="composer-trigger" aria-expanded="true" data-codex-intelligence-trigger="true"
      data-selected-reasoning-effort="high">5.6 Sol 高</button>
    <div role="menu">
      <div data-model-picker-view="advanced" id="picker">
        <div inert aria-hidden="true">
          <button data-model-picker-view-toggle>5.6 Sol 高</button>
          <button data-reasoning-slider disabled>Power</button>
        </div>
        <div><button id="terra-row" role="menuitemradio">GPT-5.6 Terra</button></div>
      </div>
    </div>
  `);
  const trigger = document.querySelector("#composer-trigger");
  document.querySelector("#terra-row").addEventListener("click", () => {
    trigger.dataset.selectedReasoningEffort = "high";
    trigger.textContent = "5.6 Terra 高";
  });
  trigger.addEventListener("click", () => trigger.setAttribute("aria-expanded", "false"));

  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();
  document.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-terra"][data-effort-id="high"]'
  ).click();
  await settle(30);

  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.match(trigger.textContent, /5\.6 Terra 高/);
});

test("点击旧版能力项复用原生模型子菜单和推理选项", async () => {
  const { window, document } = createDom(`
    <button id="legacy-trigger" aria-expanded="true" data-codex-intelligence-trigger="true"
      data-selected-reasoning-effort="high">5.6 Sol 高</button>
    <div role="menu" id="legacy-main">
      <div role="menuitem" id="model-trigger"><span data-model-picker-model-row>5.6 Sol</span></div>
      <div role="menuitem" id="effort-high" data-reasoning-selected="true">高</div>
      <div role="menuitem" id="effort-xhigh">极高</div>
    </div>
    <div role="menu" id="legacy-models" hidden>
      <div role="menuitemradio">GPT-5.6 Sol</div>
      <div role="menuitemradio" id="legacy-terra">GPT-5.6 Terra</div>
    </div>
  `);
  const trigger = document.querySelector("#legacy-trigger");
  const models = document.querySelector("#legacy-models");
  const events = [];
  document.querySelector("#model-trigger").addEventListener("click", () => models.removeAttribute("hidden"));
  document.querySelector("#legacy-terra").addEventListener("click", () => {
    events.push("model:terra");
    trigger.textContent = "5.6 Terra 高";
    models.setAttribute("hidden", "");
  });
  document.querySelector("#effort-xhigh").addEventListener("click", () => {
    events.push("effort:xhigh");
    trigger.dataset.selectedReasoningEffort = "xhigh";
    trigger.textContent = "5.6 Terra 极高";
  });

  install(window, document, snapshot, { selectorContract: "data-codex-intelligence-trigger-v1" });
  await settle();
  const root = document.querySelector("#legacy-main > [data-codex-efficiency-root]");
  root.querySelector("[data-codex-efficiency-entry]").click();
  root.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-terra"][data-effort-id="xhigh"]'
  ).click();
  await settle(30);

  assert.deepEqual(events, ["model:terra", "effort:xhigh"]);
  assert.equal(trigger.dataset.selectedReasoningEffort, "xhigh");
  assert.match(trigger.textContent, /5\.6 Terra 极高/);
});

test("旧版推理档位位于子菜单时先打开原生入口再选择", async () => {
  const { window, document } = createDom(`
    <button id="legacy-trigger" aria-expanded="true" data-codex-intelligence-trigger="true"
      data-selected-reasoning-effort="high">5.6 Sol 高</button>
    <div role="menu" id="legacy-main">
      <div role="menuitem"><span data-model-picker-model-row>5.6 Sol</span></div>
      <div role="menuitem" id="reasoning-trigger">推理强度 高</div>
    </div>
    <div role="menu" id="legacy-efforts" hidden>
      <div role="menuitemradio">高</div>
      <div role="menuitemradio" id="legacy-xhigh">极高</div>
    </div>
  `);
  const trigger = document.querySelector("#legacy-trigger");
  const efforts = document.querySelector("#legacy-efforts");
  document.querySelector("#reasoning-trigger").addEventListener("click", () => {
    efforts.removeAttribute("hidden");
  });
  document.querySelector("#legacy-xhigh").addEventListener("click", () => {
    trigger.dataset.selectedReasoningEffort = "xhigh";
    trigger.textContent = "5.6 Sol 极高";
    efforts.setAttribute("hidden", "");
  });

  install(window, document, snapshot, { selectorContract: "data-codex-intelligence-trigger-v1" });
  await settle();
  const root = document.querySelector("#legacy-main > [data-codex-efficiency-root]");
  root.querySelector("[data-codex-efficiency-entry]").click();
  root.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-sol"][data-effort-id="xhigh"]'
  ).click();
  await settle(30);

  assert.equal(trigger.dataset.selectedReasoningEffort, "xhigh");
  assert.match(trigger.textContent, /5\.6 Sol 极高/);
  assert.match(root.querySelector("[data-codex-efficiency-status]").textContent, /已切换/);
});

test("面板底部刷新可桥接，快照更新解除 loading 且不重复注入", async () => {
  const { window, document } = createDom(`
    <div role="menu"><div data-model-picker-view="simple"></div></div>
  `);
  const refreshPayloads = [];
  window.codexEfficiencyRefresh = (payload) => refreshPayloads.push(payload);
  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();

  const panel = document.querySelector("[data-codex-efficiency-panel]");
  const refreshButton = panel.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(panel.lastElementChild.lastElementChild, refreshButton);
  refreshButton.click();
  assert.equal(refreshPayloads.length, 1);
  assert.equal(refreshButton.dataset.loading, "true");

  install(window, document, updatedSnapshot);
  await settle();
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-grid]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-refresh]").length, 1);
  const updatedRefresh = document.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(updatedRefresh.dataset.loading, "false");
  const updated = document.querySelector(
    '[data-codex-efficiency-option][data-model-id="gpt-5.6-sol"][data-effort-id="high"]'
  );
  assert.match(updated.textContent, /综合109.*工程108/);

  install(window, document, updatedSnapshot);
  await settle();
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
});

test("刷新桥接异常和超时后可重试", async () => {
  const { window, document } = createDom(`<div data-model-picker-view="simple"></div>`);
  let timeoutCallback;
  const timer = { unref() {} };
  const clock = {
    setTimeout(callback) {
      timeoutCallback = callback;
      return timer;
    },
    clearTimeout() {}
  };
  install(window, document, snapshot, clock);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();
  let refreshButton = document.querySelector("[data-codex-efficiency-refresh]");
  const status = document.querySelector("[data-codex-efficiency-status]");

  refreshButton.click();
  assert.equal(refreshButton.disabled, false);
  assert.match(status.textContent, /刷新失败：刷新桥接未连接/);
  let refreshCalls = 0;
  window.codexEfficiencyRefresh = () => { refreshCalls += 1; };
  refreshButton.click();
  assert.equal(refreshButton.disabled, true);
  timeoutCallback();
  assert.equal(refreshButton.disabled, false);
  assert.match(status.textContent, /等待数据返回超时/);

  refreshButton.click();
  assert.equal(refreshCalls, 2);
  install(window, document, updatedSnapshot, clock);
  await settle();
  refreshButton = document.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(refreshButton.disabled, false);
  assert.doesNotMatch(document.querySelector("[data-codex-efficiency-status]").textContent, /失败/);
});

test("已收到新快照后忽略旧刷新 Promise 的迟到拒绝", async () => {
  const { window, document } = createDom(`<div data-model-picker-view="simple"></div>`);
  let rejectRefresh;
  window.codexEfficiencyRefresh = () => new Promise((resolve, reject) => { rejectRefresh = reject; });
  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();
  document.querySelector("[data-codex-efficiency-refresh]").click();
  install(window, document, updatedSnapshot);
  await settle();

  rejectRefresh(new Error("迟到错误"));
  await settle();
  const status = document.querySelector("[data-codex-efficiency-status]");
  const refreshButton = document.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(refreshButton.disabled, false);
  assert.doesNotMatch(status.textContent, /迟到错误|刷新失败/);
});
