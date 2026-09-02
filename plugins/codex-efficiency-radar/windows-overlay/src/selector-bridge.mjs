function installSelectorBridge(nextSnapshot, nextSelectorContract) {
  const BRIDGE_KEY = "__codexEfficiencyRadarSelector";
  const BRIDGE_VERSION = 1;
  const effortOrder = ["low", "medium", "high", "xhigh", "max", "ultra"];
  const effortAliases = {
    low: ["轻度", "低", "low", "light"],
    medium: ["中", "标准", "medium", "standard"],
    high: ["高", "high", "extended"],
    xhigh: ["极高", "超高", "xhigh", "extrahigh"],
    max: ["最高", "max", "maximum"],
    ultra: ["ultra", "极致"]
  };
  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/gpt/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const effortRank = (id) => effortOrder.indexOf(id);
  const isUsable = (node) => Boolean(
    node &&
    !node.disabled &&
    node.getAttribute?.("aria-disabled") !== "true" &&
    !node.hasAttribute?.("data-disabled") &&
    !node.closest?.('[inert], [hidden], [aria-hidden="true"]')
  );
  const directMenuItems = (menu) =>
    [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')]
      .filter((item) => item.closest('[role="menu"]') === menu);
  const describedText = (node) => String(node?.getAttribute?.("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const waitFor = (reader, message, timeoutMs = 1800) => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      let value = null;
      try { value = reader(); } catch {}
      if (value) resolve(value);
      else if (Date.now() >= deadline) reject(new Error(message));
      else setTimeout(poll, 30);
    };
    poll();
  });
  const dispatchKey = (node, key) => {
    let event;
    if (typeof window.KeyboardEvent === "function") {
      event = new window.KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, code: key, key
      });
    } else {
      event = new window.Event("keydown", { bubbles: true, cancelable: true });
      for (const [name, value] of [["key", key], ["code", key]]) {
        try { Object.defineProperty(event, name, { configurable: true, value }); } catch {}
      }
    }
    node.dispatchEvent(event);
  };

  const existing = window[BRIDGE_KEY];
  if (existing && existing.version !== BRIDGE_VERSION) delete window[BRIDGE_KEY];
  const bridge = window[BRIDGE_KEY] ?? {
    version: BRIDGE_VERSION,
    snapshot: nextSnapshot,
    selectorContract: nextSelectorContract,
    update(snapshot, selectorContract) {
      this.snapshot = snapshot;
      this.selectorContract = selectorContract;
    },
    identifyEffort(text) {
      const value = normalize(text);
      const ordered = ["ultra", "xhigh", "max", "medium", "high", "low"];
      return ordered.find((effort) =>
        effortAliases[effort].some((alias) => value.includes(normalize(alias)))
      ) ?? null;
    },
    identifyModel(text) {
      const value = normalize(text);
      if (!value) return null;
      return this.snapshot.models.find((model) =>
        [model.id, model.label, model.shortLabel]
          .filter(Boolean)
          .some((alias) => value.includes(normalize(alias)))
      ) ?? null;
    },
    readNew(picker) {
      const slider = picker?.querySelector?.("[data-reasoning-slider]");
      const statusText = describedText(slider) ||
        picker?.querySelector?.('[role="status"]')?.textContent || "";
      const toggleText = picker?.querySelector?.("[data-model-picker-view-toggle]")?.textContent || "";
      const trigger = this.activeLegacyTrigger();
      return {
        model: this.identifyModel(statusText) ??
          this.identifyModel(trigger?.textContent) ??
          this.identifyModel(toggleText),
        effort: this.identifyEffort(statusText) ??
          trigger?.dataset?.selectedReasoningEffort ??
          this.identifyEffort(toggleText) ??
          null,
        statusText,
        slider,
        trigger
      };
    },
    activeLegacyTrigger() {
      const triggers = [...document.querySelectorAll("[data-codex-intelligence-trigger]")];
      return triggers.find((trigger) => trigger.getAttribute("aria-expanded") === "true") ?? triggers[0];
    },
    readLegacy() {
      const trigger = this.activeLegacyTrigger();
      const selectedModel = [...document.querySelectorAll(
        '[data-model-selected="true"], [data-model-selected]'
      )].filter(isUsable).find((row) => this.identifyModel(row.textContent));
      const selectedEffort = [...document.querySelectorAll(
        '[data-reasoning-selected="true"], [data-reasoning-selected]'
      )].filter(isUsable).find((row) => this.identifyEffort(row.textContent));
      return {
        trigger,
        model: this.identifyModel(trigger?.textContent) ??
          this.identifyModel(selectedModel?.textContent),
        effort: trigger?.dataset?.selectedReasoningEffort ||
          this.identifyEffort(selectedEffort?.textContent) ||
          this.identifyEffort(trigger?.textContent)
      };
    },
    read(node) {
      const menu = node?.closest?.('[role="menu"]');
      const scope = menu ?? node?.parentElement ?? document;
      const picker = scope.querySelector?.("[data-model-picker-view]");
      return picker ? this.readNew(picker) : this.readLegacy();
    },
    findNewModelRow(picker, modelId) {
      return [...picker.querySelectorAll('[role="menuitemradio"]')]
        .filter(isUsable)
        .find((row) => this.identifyModel(row.textContent)?.id === modelId);
    },
    async selectNewModel(picker, modelId) {
      let row = this.findNewModelRow(picker, modelId);
      if (!row) {
        const toggle = picker.querySelector("[data-model-picker-view-toggle]");
        if (!isUsable(toggle)) throw new Error("原生模型列表入口不可用");
        toggle.click();
        row = await waitFor(
          () => this.findNewModelRow(picker, modelId),
          "原生模型列表中没有目标模型"
        );
      }
      row.click();
      await waitFor(() => {
        const selection = this.readNew(picker);
        return selection.model?.id === modelId &&
          (isUsable(selection.slider) || selection.effort) ? selection : null;
      }, "原生选择器未确认目标模型");
    },
    async selectNew(picker, modelId, effortId) {
      let current = this.readNew(picker);
      if (picker.getAttribute("data-model-picker-view") === "advanced" || current.model?.id !== modelId) {
        await this.selectNewModel(picker, modelId);
      }
      let recoveredModelMode = false;
      const visited = new Set();
      for (let step = 0; step < 12; step += 1) {
        current = this.readNew(picker);
        if (current.model?.id === modelId && current.effort === effortId) {
          if (isUsable(current.slider)) dispatchKey(current.slider, "Enter");
          else if (current.trigger?.getAttribute("aria-expanded") === "true") current.trigger.click();
          return;
        }
        if (!isUsable(current.slider)) throw new Error("原生 Power 控件不可用");
        if (current.model?.id !== modelId) {
          if (recoveredModelMode) throw new Error("目标组合不在当前原生 Power 列表中");
          await this.selectNewModel(picker, modelId);
          recoveredModelMode = true;
          continue;
        }
        const key = `${current.model?.id ?? "?"}:${current.effort ?? "?"}:${current.statusText}`;
        if (visited.has(key)) throw new Error("目标推理档位不可用");
        visited.add(key);
        const currentRank = effortRank(current.effort);
        const targetRank = effortRank(effortId);
        if (currentRank < 0 || targetRank < 0 || currentRank === targetRank) {
          throw new Error("无法从原生状态识别目标推理档位");
        }
        dispatchKey(current.slider, targetRank > currentRank ? "ArrowRight" : "ArrowLeft");
        await waitFor(
          () => {
            const changed = this.readNew(picker);
            const changedKey = `${changed.model?.id ?? "?"}:${changed.effort ?? "?"}:${changed.statusText}`;
            return changedKey !== key ? changed : null;
          },
          "原生 Power 控件未接受档位切换"
        );
      }
      throw new Error("目标组合超出原生选择范围");
    },
    findLegacyMainMenu() {
      return [...document.querySelectorAll('[role="menu"]')]
        .filter(isUsable)
        .find((menu) => menu.querySelector("[data-model-picker-model-row], [data-reasoning-selected]"));
    },
    async ensureLegacyMainMenu(trigger) {
      const existingMenu = this.findLegacyMainMenu();
      if (existingMenu) return existingMenu;
      if (!isUsable(trigger)) throw new Error("旧版模型选择器入口不可用");
      trigger.click();
      return waitFor(() => this.findLegacyMainMenu(), "旧版模型选择器未打开");
    },
    async selectLegacy(modelId, effortId) {
      let current = this.readLegacy();
      if (!current.trigger) throw new Error("未找到旧版模型选择器契约");
      if (current.model?.id !== modelId) {
        const main = await this.ensureLegacyMainMenu(current.trigger);
        const marker = main.querySelector("[data-model-picker-model-row]");
        const modelTrigger = marker?.closest('[role="menuitem"]') ??
          marker?.closest("button") ?? marker;
        if (!isUsable(modelTrigger)) throw new Error("旧版原生模型子菜单不可用");
        modelTrigger.click();
        const modelRow = await waitFor(() =>
          [...document.querySelectorAll('[data-model-selected], [role="menuitemradio"]')]
            .filter(isUsable)
            .find((row) => this.identifyModel(row.textContent)?.id === modelId),
        "旧版原生模型列表中没有目标模型");
        modelRow.click();
        await waitFor(
          () => this.readLegacy().model?.id === modelId,
          "旧版选择器未确认目标模型"
        );
        current = this.readLegacy();
      }
      const main = await this.ensureLegacyMainMenu(current.trigger);
      const directEffort = directMenuItems(main)
        .filter((row) =>
          !row.hasAttribute("data-codex-efficiency-entry") &&
          row.getAttribute("aria-haspopup") !== "menu" &&
          !/推理强度|推理|reasoning|effort/i.test(row.textContent ?? "") &&
          isUsable(row)
        )
        .find((row) => this.identifyEffort(row.textContent) === effortId);
      if (directEffort) {
        directEffort.click();
      } else {
        const effortTrigger = directMenuItems(main).find((row) =>
          isUsable(row) &&
          (/推理强度|推理|reasoning|effort/i.test(row.textContent ?? "") ||
            row.hasAttribute("data-reasoning-trigger"))
        );
        if (!effortTrigger) throw new Error("旧版原生推理列表入口不可用");
        effortTrigger.click();
        const effortRow = await waitFor(() => [...document.querySelectorAll('[role="menu"]')]
          .filter((menu) => menu !== main && isUsable(menu))
          .flatMap((menu) => directMenuItems(menu))
          .filter(isUsable)
          .find((row) => this.identifyEffort(row.textContent) === effortId),
        "旧版原生推理列表中没有目标档位");
        effortRow.click();
      }
      await waitFor(
        () => this.readLegacy().effort === effortId,
        "旧版选择器未确认目标推理档位"
      );
    },
    async select(option, modelId, effortId) {
      const menu = option?.closest?.('[role="menu"]');
      const scope = menu ?? option?.parentElement ?? document;
      const picker = scope.querySelector?.("[data-model-picker-view]");
      if (picker) await this.selectNew(picker, modelId, effortId);
      else await this.selectLegacy(modelId, effortId);
    }
  };

  window[BRIDGE_KEY] = bridge;
  bridge.update(nextSnapshot, nextSelectorContract);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildSelectorBridgeSource(snapshot, selectorContract = "auto") {
  return `(${installSelectorBridge.toString()})(${safeJson(snapshot)},${safeJson(selectorContract)});`;
}
