const SELECTOR_STATE_SOURCE = `(() => {
  const visible = (node) => {
    if (!node || typeof node.getBoundingClientRect !== "function") return false;
    const rect = node.getBoundingClientRect();
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    return rect.width > 0 && rect.height > 0 &&
      style?.display !== "none" && style?.visibility !== "hidden";
  };
  const triggers = [...document.querySelectorAll("[data-codex-intelligence-trigger]")];
  const trigger = triggers.find(visible) ?? triggers[0] ?? null;
  const surface = [...document.querySelectorAll(
    "[data-model-picker-view], [data-codex-efficiency-entry]"
  )].find(visible) ?? null;
  const rect = trigger?.getBoundingClientRect?.();
  return {
    surfaceOpen: Boolean(surface),
    triggerPoint: rect && rect.width > 0 && rect.height > 0
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null
  };
})()`;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readSelectorState(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: SELECTOR_STATE_SOURCE,
    awaitPromise: false,
    returnByValue: true
  }, 5000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "无法读取原生模型选择器状态");
  }
  return result.result?.value ?? { surfaceOpen: false, triggerPoint: null };
}

async function dispatchTrustedClick(client, point) {
  await client.send("Page.bringToFront", {}, 5000);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  }, 5000);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1
  }, 5000);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1
  }, 5000);
}

export async function ensureModelSelectorOpen(
  client,
  { timeoutMs = 10000, pollMs = 200, wait = sleep } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let clicked = false;
  let triggerPoint = null;
  while (Date.now() < deadline) {
    const state = await readSelectorState(client);
    if (state.surfaceOpen) return { opened: clicked, triggerPoint };
    if (state.triggerPoint) {
      triggerPoint = state.triggerPoint;
      await dispatchTrustedClick(client, triggerPoint);
      clicked = true;
    }
    await wait(pollMs);
  }
  throw new Error("无法通过受信任输入打开 Codex 原生模型选择器");
}

export async function closeModelSelectorIfOpened(client, session) {
  if (!session?.opened || !session.triggerPoint) return;
  const state = await readSelectorState(client);
  if (state.surfaceOpen) await dispatchTrustedClick(client, session.triggerPoint);
}

export { SELECTOR_STATE_SOURCE };
