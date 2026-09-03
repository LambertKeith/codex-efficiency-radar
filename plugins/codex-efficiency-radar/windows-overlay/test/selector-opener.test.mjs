import assert from "node:assert/strict";
import test from "node:test";

import {
  closeModelSelectorIfOpened,
  ensureModelSelectorOpen
} from "../src/selector-opener.mjs";

function selectorClient(states) {
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      if (method === "Runtime.evaluate") {
        const state = states.shift() ?? { surfaceOpen: true, triggerPoint: null };
        return { result: { value: state } };
      }
      return {};
    }
  };
}

test("使用 CDP 受信任鼠标事件打开原生模型选择器", async () => {
  const point = { x: 120, y: 680 };
  const client = selectorClient([
    { surfaceOpen: false, triggerPoint: point },
    { surfaceOpen: true, triggerPoint: point }
  ]);

  const session = await ensureModelSelectorOpen(client, {
    timeoutMs: 1000,
    pollMs: 0,
    wait: async () => {}
  });

  assert.deepEqual(session, { opened: true, triggerPoint: point });
  assert.deepEqual(
    client.calls.map(({ method }) => method),
    [
      "Runtime.evaluate",
      "Page.bringToFront",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Runtime.evaluate"
    ]
  );
  assert.deepEqual(
    client.calls.filter(({ method }) => method === "Input.dispatchMouseEvent")
      .map(({ params }) => params.type),
    ["mouseMoved", "mousePressed", "mouseReleased"]
  );
});

test("只关闭由验证器主动打开的模型选择器", async () => {
  const point = { x: 120, y: 680 };
  const client = selectorClient([{ surfaceOpen: true, triggerPoint: point }]);

  await closeModelSelectorIfOpened(client, { opened: true, triggerPoint: point });
  assert.equal(
    client.calls.filter(({ method }) => method === "Input.dispatchMouseEvent").length,
    3
  );

  const untouched = selectorClient([]);
  await closeModelSelectorIfOpened(untouched, { opened: false, triggerPoint: point });
  assert.equal(untouched.calls.length, 0);
});
