function installEfficiencyOverlay(nextSnapshot) {
  const ROOT_KEY = "__codexEfficiencyRadarOverlay";
  const OVERLAY_VERSION = 3;
  const STYLE_ID = "codex-efficiency-radar-style";
  const BADGE_ATTR = "data-codex-efficiency-badges";
  const ROW_ATTR = "data-codex-efficiency-row";
  const REFRESH_ATTR = "data-codex-efficiency-refresh";

  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/gpt/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");

  const effortAliases = {
    low: ["轻度", "低", "low", "light"],
    medium: ["中", "标准", "medium", "standard"],
    high: ["高", "high", "extended"],
    xhigh: ["极高", "xhigh", "extrahigh"],
    max: ["最高", "max", "maximum"],
    ultra: ["ultra"]
  };

  const ensureStyle = () => {
    const style = document.getElementById(STYLE_ID) ?? document.createElement("style");
    const css = `
      [${ROW_ATTR}] { flex-direction: row !important; align-items: center !important; justify-content: flex-start !important; }
      [${ROW_ATTR}] > :first-child { width: auto !important; min-width: 0; flex: 1 1 auto; }
      [${BADGE_ATTR}] { margin-inline-start: auto; display: inline-flex; flex: 0 0 auto; gap: 4px; padding-inline-start: 10px; }
      [${BADGE_ATTR}] > span { border-radius: 5px; padding: 1px 5px; font-size: 11px; line-height: 18px; font-weight: 600; white-space: nowrap; }
      [${BADGE_ATTR}] .codex-efficiency-intelligence { color: #8b5cf6; background: color-mix(in srgb, #8b5cf6 12%, transparent); }
      [${BADGE_ATTR}] .codex-efficiency-software { color: #0ea5e9; background: color-mix(in srgb, #0ea5e9 12%, transparent); }
      [${REFRESH_ATTR}] { width: 100%; margin: 4px 0 0; border: 0; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); background: transparent; color: inherit; text-align: start; cursor: pointer; opacity: .82; justify-content: flex-start !important; }
      [${REFRESH_ATTR}]:hover { opacity: 1; }
      [${REFRESH_ATTR}][data-loading="true"] { cursor: wait; opacity: .55; }
    `;
    if (!style.id) style.id = STYLE_ID;
    if (style.textContent !== css) style.textContent = css;
    if (!style.isConnected) document.head.append(style);
  };

  const identifyEffort = (text) => {
    const value = normalize(text);
    const ordered = ["ultra", "xhigh", "max", "medium", "high", "low"];
    return ordered.find((effort) =>
      effortAliases[effort].some((alias) => {
        const normalizedAlias = normalize(alias);
        return normalizedAlias.length <= 1
          ? value === normalizedAlias
          : value === normalizedAlias || value.startsWith(normalizedAlias);
      })
    ) ?? null;
  };

  const identifyModel = (text, snapshot) => {
    const value = normalize(text);
    return snapshot.models.find((model) =>
      [model.id, model.label, model.shortLabel]
        .filter(Boolean)
        .some((alias) => value.includes(normalize(alias)))
    ) ?? snapshot.models[0] ?? null;
  };

  const badgeNode = (effort) => {
    const wrapper = document.createElement("span");
    wrapper.setAttribute(BADGE_ATTR, "true");
    wrapper.dataset.signature = `${effort.comprehensiveIq}:${effort.softwareIq}`;
    wrapper.setAttribute("aria-label", `综合智能 ${effort.comprehensiveIq}，软件工程能力 ${effort.softwareIq}`);

    const intelligence = document.createElement("span");
    intelligence.className = "codex-efficiency-intelligence";
    intelligence.textContent = `综 ${effort.comprehensiveIq}`;
    const software = document.createElement("span");
    software.className = "codex-efficiency-software";
    software.textContent = `工 ${effort.softwareIq}`;
    wrapper.append(intelligence, software);
    return wrapper;
  };

  const existingState = window[ROOT_KEY];
  if (existingState && existingState.version !== OVERLAY_VERSION) {
    existingState.observer?.disconnect();
    for (const button of document.querySelectorAll(`[${REFRESH_ATTR}]`)) button.remove();
    delete window[ROOT_KEY];
  }

  const state = window[ROOT_KEY] ?? {
    version: OVERLAY_VERSION,
    snapshot: nextSnapshot,
    scheduled: false,
    observer: null,
    render() {
      ensureStyle();
      const triggerText = [...document.querySelectorAll('[data-codex-intelligence-trigger="true"]')]
        .map((node) => node.textContent)
        .join(" ");

      for (const menu of document.querySelectorAll('[role="menu"]')) {
        const items = [...menu.querySelectorAll(':scope [role="menuitemradio"], :scope [role="menuitem"]')];
        const effortItems = items
          .map((item) => ({ item, effortId: identifyEffort(item.textContent) }))
          .filter(({ effortId }) => effortId);

        if (effortItems.length >= 2) {
          const model = identifyModel(`${triggerText} ${menu.textContent}`, this.snapshot);
          for (const { item, effortId } of effortItems) {
            const effort = model?.efforts.find((candidate) => candidate.id === effortId);
            const existing = item.querySelector(`[${BADGE_ATTR}]`);
            const signature = effort ? `${effort.comprehensiveIq}:${effort.softwareIq}` : null;
            if (!effort) {
              existing?.remove();
              item.removeAttribute(ROW_ATTR);
            } else {
              item.setAttribute(ROW_ATTR, "true");
              if (!existing) item.append(badgeNode(effort));
              else if (existing.dataset.signature !== signature) existing.replaceWith(badgeNode(effort));
            }
          }
        }

        const menuText = menu.textContent ?? "";
        const isRootMenu = /模型|model/i.test(menuText) && /推理强度|effort|reasoning/i.test(menuText);
        if (isRootMenu && !menu.querySelector(`[${REFRESH_ATTR}]`)) {
          const button = document.createElement("button");
          button.type = "button";
          const nativeMenuItem = items.find(
            (item) => /模型|model|推理强度|effort|reasoning/i.test(item.textContent ?? "")
          );
          if (nativeMenuItem?.className) button.className = nativeMenuItem.className;
          button.setAttribute(REFRESH_ATTR, "true");
          button.setAttribute("role", "menuitem");
          button.textContent = "刷新效率值";
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.loading === "true") return;
            button.dataset.loading = "true";
            button.textContent = "正在刷新效率值…";
            try {
              if (typeof window.codexEfficiencyRefresh !== "function") {
                throw new Error("刷新桥接未连接");
              }
              window.codexEfficiencyRefresh(JSON.stringify({ requestedAt: Date.now() }));
            } catch (error) {
              button.dataset.loading = "false";
              button.textContent = `刷新失败：${error.message}`;
              setTimeout(() => { button.textContent = "刷新效率值"; }, 2000);
            }
          });
          menu.append(button);
        }
      }
    },
    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      requestAnimationFrame(() => {
        this.scheduled = false;
        this.render();
      });
    },
    updateSnapshot(snapshot) {
      this.snapshot = snapshot;
      for (const button of document.querySelectorAll(`[${REFRESH_ATTR}]`)) {
        button.dataset.loading = "false";
        button.textContent = "刷新效率值";
      }
      this.schedule();
    }
  };

  if (!window[ROOT_KEY]) {
    window[ROOT_KEY] = state;
    state.observer = new MutationObserver(() => state.schedule());
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  state.updateSnapshot(nextSnapshot);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildInjectionSource(snapshot) {
  return `(${installEfficiencyOverlay.toString()})(${safeJson(snapshot)});`;
}
