async function verifyEfficiencySelector(timeoutMs) {
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const deadline = Date.now() + timeoutMs;
  let trigger = null;
  let openedSelector = false;
  let lastObservation = null;

  while (Date.now() < deadline) {
    trigger = document.querySelector("[data-codex-intelligence-trigger]");
    if (trigger) break;
    await sleep(200);
  }
  if (!trigger) {
    return { ok: false, reason: "未找到 Codex 原生模型选择器触发器" };
  }

  const wasOpen =
    trigger.getAttribute("aria-expanded") === "true" ||
    trigger.dataset?.state === "open" ||
    Boolean(document.querySelector(
      "[data-model-picker-view], [data-codex-efficiency-entry]"
    ));
  if (!wasOpen) {
    trigger.click();
    openedSelector = true;
  }
  let openedEfficiencyPanel = false;

  try {
    while (Date.now() < deadline) {
      const currentTrigger = document.querySelector("[data-codex-intelligence-trigger]");
      const currentEntry = document.querySelector("[data-codex-efficiency-entry]");
      const currentPicker = document.querySelector("[data-model-picker-view]");
      const selectorOpen =
        currentTrigger?.getAttribute("aria-expanded") === "true" ||
        currentTrigger?.dataset?.state === "open" ||
        Boolean(currentEntry || currentPicker);
      if (currentTrigger && !selectorOpen) {
        lastObservation = {
          selectorOpen: false,
          entryFound: false,
          entryLabel: null,
          entryVisible: false,
          panelFound: false,
          panelVisible: false,
          optionCount: 0,
          numericScoreCount: 0,
          expectedValueCount: 0,
          valuesMatchSnapshot: false
        };
        currentTrigger.click();
        openedSelector = true;
        await sleep(200);
        continue;
      }
      const entry = currentEntry;
      const root = entry?.closest?.("[data-codex-efficiency-root]");
      const options = root
        ? [...root.querySelectorAll("[data-codex-efficiency-option]")]
        : [];
      const scores = root
        ? [...root.querySelectorAll(".codex-efficiency-score")]
        : [];
      const numericScores = scores.filter((score) => /\d/.test(score.textContent ?? ""));
      const snapshot = window.__codexEfficiencyRadarOverlay?.snapshot;
      const label = entry?.querySelector?.(".codex-efficiency-entry-label")?.textContent?.trim();
      const entryVisible =
        typeof entry?.getClientRects !== "function" || entry.getClientRects().length > 0;

      if (label === "效率" && entryVisible && entry.getAttribute("aria-expanded") !== "true") {
        entry.click();
        openedEfficiencyPanel = true;
        await sleep(100);
        continue;
      }

      const panel = root?.querySelector?.("[data-codex-efficiency-panel]");
      const panelVisible =
        panel && !panel.hidden &&
        (typeof panel.getClientRects !== "function" || panel.getClientRects().length > 0);
      const expectedPairs = Array.isArray(snapshot?.models)
        ? snapshot.models.flatMap((model) =>
            (model.efforts ?? [])
              .filter(
                (effort) =>
                  Number.isFinite(Number(effort.comprehensiveIq)) &&
                  Number.isFinite(Number(effort.softwareIq))
              )
              .map((effort) => ({
                modelId: model.id ?? "",
                effortId: effort.id,
                values: [
                  String(Math.round(Number(effort.comprehensiveIq))),
                  String(Math.round(Number(effort.softwareIq)))
                ]
              }))
          )
        : [];
      const allValuesMatch = expectedPairs.length > 0 && expectedPairs.every((expected) => {
        const option = options.find(
          (candidate) =>
            candidate.dataset?.modelId === expected.modelId &&
            candidate.dataset?.effortId === expected.effortId
        );
        const actual = option
          ? [...option.querySelectorAll(".codex-efficiency-score")].map(
              (score) => score.textContent?.trim() ?? ""
            )
          : [];
        return expected.values.every((value, index) => actual[index] === value);
      });
      lastObservation = {
        selectorOpen: Boolean(selectorOpen),
        entryFound: Boolean(entry),
        entryLabel: label ?? null,
        entryVisible: Boolean(entryVisible),
        panelFound: Boolean(panel),
        panelVisible: Boolean(panelVisible),
        optionCount: options.length,
        numericScoreCount: numericScores.length,
        expectedValueCount: expectedPairs.length * 2,
        valuesMatchSnapshot: allValuesMatch
      };

      if (
        label === "效率" &&
        entryVisible &&
        panelVisible &&
        options.length > 0 &&
        numericScores.length === expectedPairs.length * 2 &&
        allValuesMatch &&
        Array.isArray(snapshot?.models) &&
        snapshot.models.length > 0
      ) {
        return {
          ok: true,
          entryLabel: label,
          modelCount: snapshot.models.length,
          optionCount: options.length,
          numericScoreCount: numericScores.length,
          expectedValueCount: expectedPairs.length * 2,
          valuesMatchSnapshot: true,
          checkedAt: snapshot.source?.checkedAt ?? null
        };
      }
      await sleep(200);
    }
    const diagnostic = lastObservation
      ? Object.entries(lastObservation).map(([key, value]) => `${key}=${value}`).join(", ")
      : "未取得模型菜单 DOM 观测";
    return {
      ok: false,
      reason: `效率入口或数值面板未在模型选择器中就绪（${diagnostic}）`,
      diagnostic: lastObservation
    };
  } finally {
    if (openedEfficiencyPanel) {
      const currentEntry = document.querySelector("[data-codex-efficiency-entry]");
      if (currentEntry?.getAttribute("aria-expanded") === "true") currentEntry.click();
    }
    if (!wasOpen && openedSelector) {
      const currentTrigger = document.querySelector("[data-codex-intelligence-trigger]");
      const stillOpen =
        currentTrigger?.getAttribute("aria-expanded") === "true" ||
        currentTrigger?.dataset?.state === "open" ||
        Boolean(document.querySelector(
          "[data-model-picker-view], [data-codex-efficiency-entry]"
        ));
      if (stillOpen) currentTrigger.click();
    }
  }
}

export function buildUiVerificationSource(timeoutMs = 15000) {
  return `(${verifyEfficiencySelector.toString()})(${JSON.stringify(timeoutMs)})`;
}

function verifyEfficiencyRuntime() {
  const overlay = window.__codexEfficiencyRadarOverlay;
  const selector = window.__codexEfficiencyRadarSelector;
  const models = overlay?.snapshot?.models;
  const checkedAt = overlay?.snapshot?.source?.checkedAt ?? null;
  if (!selector || !Array.isArray(models) || models.length === 0) {
    return {
      ok: false,
      selectorOpen: false,
      mode: "runtime",
      reason: "效率注入运行时对象已从目标界面消失",
      modelCount: Array.isArray(models) ? models.length : 0,
      checkedAt
    };
  }

  const visible = (node) => {
    if (!node || typeof node.getBoundingClientRect !== "function") return false;
    const rect = node.getBoundingClientRect();
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    return rect.width > 0 && rect.height > 0 &&
      style?.display !== "none" && style?.visibility !== "hidden";
  };
  const triggerOpen = [...document.querySelectorAll("[data-codex-intelligence-trigger]")]
    .some((trigger) =>
      visible(trigger) &&
      (trigger.getAttribute("aria-expanded") === "true" || trigger.dataset?.state === "open")
    );
  const pickerOpen = [...document.querySelectorAll("[data-model-picker-view]")].some(visible);
  const visibleEntries = [...document.querySelectorAll("[data-codex-efficiency-entry]")]
    .filter(visible);
  const directMenuItems = (menu) =>
    [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')]
      .filter((item) => item.closest('[role="menu"]') === menu);
  const legacyMenuOpen = [...document.querySelectorAll('[role="menu"]')]
    .filter(visible)
    .some((menu) => {
      if (menu.querySelector("[data-model-picker-view]")) return false;
      const marked = Boolean(menu.querySelector(
        "[data-model-selected], [data-reasoning-selected], [data-model-picker-model-row], " +
        "[data-model-picker-view-toggle], [data-reasoning-slider]"
      ));
      const text = menu.textContent ?? "";
      const explicitlyNamed =
        /模型|model/i.test(text) && /推理强度|推理|reasoning|effort/i.test(text);
      const identifiedModels = new Set(
        directMenuItems(menu)
          .map((item) => selector.identifyModel?.(item.textContent)?.id)
          .filter(Boolean)
      );
      const identifiedEfforts = new Set(
        directMenuItems(menu)
          .map((item) => selector.identifyEffort?.(item.textContent))
          .filter(Boolean)
      );
      const contractCandidate = identifiedModels.size >= 2 || identifiedEfforts.size >= 2;
      return marked || explicitlyNamed || identifiedModels.size >= 2 ||
        (triggerOpen && contractCandidate);
    });
  const selectorOpen = pickerOpen || visibleEntries.length > 0 || legacyMenuOpen;

  if (!selectorOpen) {
    return {
      ok: true,
      selectorOpen: false,
      mode: "runtime",
      modelCount: models.length,
      checkedAt
    };
  }

  const entry = visibleEntries[0] ?? null;
  const root = entry?.closest?.("[data-codex-efficiency-root]");
  const options = root
    ? [...root.querySelectorAll("[data-codex-efficiency-option]")]
    : [];
  const numericScores = root
    ? [...root.querySelectorAll(".codex-efficiency-score")]
      .filter((score) => /\d/.test(score.textContent ?? ""))
    : [];
  const entryLabel = entry
    ?.querySelector?.(".codex-efficiency-entry-label")
    ?.textContent?.trim() ?? null;
  const expectedPairs = models.flatMap((model) =>
    (model.efforts ?? [])
      .filter(
        (effort) =>
          Number.isFinite(Number(effort.comprehensiveIq)) &&
          Number.isFinite(Number(effort.softwareIq))
      )
      .map((effort) => ({
        modelId: model.id ?? "",
        effortId: effort.id,
        values: [
          String(Math.round(Number(effort.comprehensiveIq))),
          String(Math.round(Number(effort.softwareIq)))
        ]
      }))
  );
  const valuesMatchSnapshot = expectedPairs.length > 0 && expectedPairs.every((expected) => {
    const option = options.find(
      (candidate) =>
        candidate.dataset?.modelId === expected.modelId &&
        candidate.dataset?.effortId === expected.effortId
    );
    const actual = option
      ? [...option.querySelectorAll(".codex-efficiency-score")]
        .map((score) => score.textContent?.trim() ?? "")
      : [];
    return expected.values.every((value, index) => actual[index] === value);
  });
  const evidence = {
    selectorOpen: true,
    mode: "ui-dom",
    entryLabel,
    modelCount: models.length,
    optionCount: options.length,
    numericScoreCount: numericScores.length,
    expectedValueCount: expectedPairs.length * 2,
    valuesMatchSnapshot,
    checkedAt
  };
  if (
    entryLabel !== "效率" ||
    options.length === 0 ||
    numericScores.length !== expectedPairs.length * 2 ||
    !valuesMatchSnapshot
  ) {
    return {
      ...evidence,
      ok: false,
      reason: "已打开的模型选择器缺少效率入口、档位或完整数值 DOM"
    };
  }
  return {
    ...evidence,
    ok: true
  };
}

export function buildUiHeartbeatSource() {
  return `(${verifyEfficiencyRuntime.toString()})()`;
}

export function assertUiHeartbeatEvidence(evidence) {
  if (!evidence?.ok) {
    throw new Error(evidence?.reason || "选择器运行时心跳验证失败");
  }
  if (evidence.selectorOpen) assertUiVerificationEvidence(evidence);
  return evidence;
}

export function assertUiVerificationEvidence(evidence) {
  if (!evidence?.ok) {
    throw new Error(evidence?.reason || "选择器端到端验证失败");
  }
  if (evidence.entryLabel !== "效率") {
    throw new Error("模型选择器未显示效率入口");
  }
  for (const field of ["modelCount", "optionCount", "numericScoreCount"]) {
    if (!Number.isInteger(evidence[field]) || evidence[field] <= 0) {
      throw new Error(`选择器验证字段无效：${field}`);
    }
  }
  if (evidence.numericScoreCount < 2) {
    throw new Error("模型选择器没有加载完整的数值对");
  }
  if (
    evidence.valuesMatchSnapshot !== true ||
    evidence.numericScoreCount !== evidence.expectedValueCount
  ) {
    throw new Error("模型选择器数值与当前 Radar 快照不一致");
  }
  return evidence;
}
