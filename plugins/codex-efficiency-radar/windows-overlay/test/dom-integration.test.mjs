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
        { id: "high", label: "高", order: 30, comprehensiveIq: 94, softwareIq: 96 }
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
    buildInjectionSource(nextSnapshot)
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

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function assertEntryAtBottom(host) {
  const root = host.lastElementChild;
  assert.equal(root?.getAttribute("data-codex-efficiency-root"), "true");
  const entry = root.querySelector("[data-codex-efficiency-entry]");
  assert.match(entry?.textContent ?? "", /查看效率值/);
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
      <div role="menuitem" class="native-menu-item text-sm">模型 5.6 Sol</div>
      <div role="menuitem" class="native-menu-item text-sm">推理强度 极高</div>
      <div role="menuitem" class="native-menu-item text-sm">高级</div>
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
      <div role="menuitem">低</div>
      <div role="menuitem">中</div>
      <div role="menuitem">高</div>
    </div>
  `);

  install(window, document);
  await settle();

  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 0);
});

test("新版 simple 和 advanced panel 各自在底部获得入口", async () => {
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div data-model-picker-track="simple">
        <section data-model-picker-panel="simple">
          <button>GPT-5.6 Sol</button>
        </section>
      </div>
      <div data-model-picker-track="advanced">
        <section data-model-picker-panel="advanced">
          <button>GPT-5.6 Terra</button>
        </section>
      </div>
    </div>
  `);

  install(window, document);
  await settle();

  const simplePanel = document.querySelector('[data-model-picker-panel="simple"]');
  const advancedPanel = document.querySelector('[data-model-picker-panel="advanced"]');
  assert.equal(document.querySelectorAll("[data-codex-efficiency-entry]").length, 2);
  assertEntryAtBottom(simplePanel);
  assertEntryAtBottom(advancedPanel);
  assert.equal(simplePanel.querySelector("[data-codex-efficiency-entry]").hasAttribute("role"), false);
  assert.equal(advancedPanel.querySelector("[data-codex-efficiency-entry]").hasAttribute("role"), false);
});

test("真实 MutationObserver 在宿主替换后为新面板补入口且不残留重复节点", async () => {
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div id="picker-track"><section id="old-panel"><button>选择模型</button></section></div>
    </div>
  `);

  install(window, document, snapshot, {
    MutationObserver: window.MutationObserver,
    requestAnimationFrame: (callback) => setTimeout(callback, 0)
  });
  await settle();
  assertEntryAtBottom(document.querySelector("#old-panel"));

  const replacement = document.createElement("section");
  replacement.id = "new-panel";
  replacement.innerHTML = "<button>选择模型</button>";
  document.querySelector("#picker-track").replaceChildren(replacement);
  await settle();
  await settle();

  assert.equal(document.querySelector("#old-panel"), null);
  assertEntryAtBottom(replacement);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
  window.__codexEfficiencyRadarOverlay.observer.disconnect();
});

test("入口展开按模型和推理强度组织的双值矩阵", async () => {
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div><section id="picker-panel"><button>选择模型</button></section></div>
    </div>
  `);

  install(window, document);
  await settle();

  const entry = document.querySelector("[data-codex-efficiency-entry]");
  const panel = document.querySelector("[data-codex-efficiency-panel]");
  entry.click();

  assert.equal(entry.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hidden, false);

  const table = panel.querySelector("[data-codex-efficiency-table]");
  const headers = [...table.querySelectorAll("thead th")];
  assert.equal(headers[0].textContent.trim(), "模型");
  assert.deepEqual(
    headers.slice(1).map((node) => node.querySelector("span").textContent.trim()),
    ["轻度", "高", "极高"]
  );

  const rows = [...table.querySelectorAll("tbody tr")];
  assert.equal(rows.length, 2);
  const rowByModel = new Map(
    rows.map((row) => [row.children[0].textContent.trim(), [...row.children].map((cell) => cell.textContent)])
  );
  assert.match(rowByModel.get("GPT-5.6 Sol")[2], /综\s*98/);
  assert.match(rowByModel.get("GPT-5.6 Sol")[2], /工\s*97/);
  assert.match(rowByModel.get("GPT-5.6 Sol")[3], /综\s*104/);
  assert.match(rowByModel.get("GPT-5.6 Sol")[3], /工\s*101/);
  assert.match(rowByModel.get("GPT-5.6 Terra")[1], /综\s*81/);
  assert.match(rowByModel.get("GPT-5.6 Terra")[1], /工\s*84/);

  entry.click();
  assert.equal(entry.getAttribute("aria-expanded"), "false");
  assert.equal(panel.hidden, true);
});

test("面板底部刷新可桥接，快照更新解除 loading 且重复注入不重复", async () => {
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div><section id="picker-panel"><button>选择模型</button></section></div>
    </div>
  `);
  const refreshPayloads = [];
  window.codexEfficiencyRefresh = (payload) => refreshPayloads.push(payload);

  install(window, document);
  await settle();
  document.querySelector("[data-codex-efficiency-entry]").click();

  const panel = document.querySelector("[data-codex-efficiency-panel]");
  const refreshButton = panel.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(panel.lastElementChild.lastElementChild, refreshButton);
  assert.equal(refreshButton.textContent, "刷新效率值");
  refreshButton.click();
  assert.equal(refreshPayloads.length, 1);
  assert.equal(refreshButton.dataset.loading, "true");
  assert.match(refreshButton.textContent, /正在刷新/);

  install(window, document, updatedSnapshot);
  await settle();

  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-entry]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-panel]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-table]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-refresh]").length, 1);
  const updatedRefreshButton = document.querySelector("[data-codex-efficiency-refresh]");
  assert.equal(updatedRefreshButton.dataset.loading, "false");
  assert.equal(updatedRefreshButton.textContent, "刷新效率值");

  const solRow = [...document.querySelectorAll("tbody tr")].find(
    (row) => row.children[0].textContent.trim() === "GPT-5.6 Sol"
  );
  assert.match(solRow.children[2].textContent, /综\s*109/);
  assert.match(solRow.children[2].textContent, /工\s*108/);

  install(window, document, updatedSnapshot);
  await settle();
  assert.equal(document.querySelectorAll("[data-codex-efficiency-root]").length, 1);
  assert.equal(document.querySelectorAll("[data-codex-efficiency-entry]").length, 1);
});

test("刷新桥接异常和超时后可重试", async () => {
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div><section id="picker-panel"><button>选择模型</button></section></div>
    </div>
  `);
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
  window.codexEfficiencyRefresh = () => {
    refreshCalls += 1;
  };
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
  const { window, document } = createDom(`
    <div data-model-picker-view>
      <div><section id="picker-panel"><button>选择模型</button></section></div>
    </div>
  `);
  let rejectRefresh;
  window.codexEfficiencyRefresh = () =>
    new Promise((resolve, reject) => {
      rejectRefresh = reject;
    });

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
