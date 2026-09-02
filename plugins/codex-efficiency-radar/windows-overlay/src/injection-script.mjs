import { OVERLAY_CSS } from "./overlay-style.mjs";
import { buildSelectorBridgeSource } from "./selector-bridge.mjs";

function installEfficiencyOverlay(nextSnapshot, overlayCss, nextSelectorContract) {
  const ROOT_KEY = "__codexEfficiencyRadarOverlay";
  const OVERLAY_VERSION = 8;
  const STYLE_ID = "codex-efficiency-radar-style";
  const ROOT_ATTR = "data-codex-efficiency-root";
  const ENTRY_ATTR = "data-codex-efficiency-entry";
  const PANEL_ATTR = "data-codex-efficiency-panel";
  const GRID_ATTR = "data-codex-efficiency-grid";
  const OPTION_ATTR = "data-codex-efficiency-option";
  const REFRESH_ATTR = "data-codex-efficiency-refresh";
  const STATUS_ATTR = "data-codex-efficiency-status";
  const SURFACE_EXPANDED_ATTR = "data-codex-efficiency-expanded";
  const LEGACY_BADGE_ATTR = "data-codex-efficiency-badges";
  const LEGACY_ROW_ATTR = "data-codex-efficiency-row";
  const REFRESH_TIMEOUT_MS = 30_000;
  const selector = window.__codexEfficiencyRadarSelector;
  if (!selector) return;

  const effortOrder = ["low", "medium", "high", "xhigh", "max", "ultra"];
  const setText = (node, value) => {
    const text = String(value ?? "");
    if (node && node.textContent !== text) node.textContent = text;
  };
  const safeScore = (value) => {
    const score = Number(value);
    return Number.isFinite(score) && score >= 0 && score <= 150 ? Math.round(score) : null;
  };
  const safeCount = (value) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
  };
  const effortRank = (id, fallback = effortOrder.length) => {
    const index = effortOrder.indexOf(id);
    return index === -1 ? fallback : index;
  };

  const ensureStyle = () => {
    const style = document.getElementById(STYLE_ID) ?? document.createElement("style");
    if (!style.id) style.id = STYLE_ID;
    if (style.textContent !== overlayCss) style.textContent = overlayCss;
    if (!style.isConnected) (document.head ?? document.documentElement).append(style);
  };
  const cleanupObsoleteUi = () => {
    for (const badge of document.querySelectorAll(`[${LEGACY_BADGE_ATTR}]`)) badge.remove();
    for (const row of document.querySelectorAll(`[${LEGACY_ROW_ATTR}]`)) {
      row.removeAttribute(LEGACY_ROW_ATTR);
    }
    for (const button of document.querySelectorAll(`[${REFRESH_ATTR}]`)) {
      if (!button.closest(`[${ROOT_ATTR}]`)) button.remove();
    }
    for (const surface of document.querySelectorAll(`[${SURFACE_EXPANDED_ATTR}]`)) {
      const open = [...surface.querySelectorAll(`[${PANEL_ATTR}]`)].some((panel) => !panel.hidden);
      if (!open) surface.removeAttribute(SURFACE_EXPANDED_ATTR);
    }
  };
  const directMenuItems = (menu) =>
    [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')]
      .filter((item) => item.closest('[role="menu"]') === menu);
  const legacyMenuEvidence = (menu, snapshot) => {
    const marked = Boolean(menu.querySelector(
      "[data-model-selected], [data-reasoning-selected], [data-model-picker-model-row], " +
      "[data-model-picker-view-toggle], [data-reasoning-slider]"
    ));
    const items = directMenuItems(menu);
    const efforts = new Set(
      items.map((item) => selector.identifyEffort(item.textContent)).filter(Boolean)
    );
    const models = new Set(
      items.map((item) => selector.identifyModel(item.textContent)?.id).filter(Boolean)
    );
    const text = menu.textContent ?? "";
    return {
      explicit: marked || (/模型|model/i.test(text) && /推理强度|推理|reasoning|effort/i.test(text)),
      candidate: efforts.size >= 2 || models.size >= 2
    };
  };
  const findSurfaceHosts = (snapshot) => {
    const hosts = new Set();
    for (const picker of document.querySelectorAll("[data-model-picker-view]")) {
      hosts.add(picker.closest('[role="menu"]') ?? picker.parentElement ?? picker);
    }

    const legacyMenus = [...document.querySelectorAll('[role="menu"]')]
      .filter((menu) => !menu.closest(`[${ROOT_ATTR}]`))
      .filter((menu) => !menu.querySelector("[data-model-picker-view]"))
      .map((menu) => ({ menu, evidence: legacyMenuEvidence(menu, snapshot) }));
    const openTrigger = [...document.querySelectorAll("[data-codex-intelligence-trigger]")]
      .some((trigger) =>
        trigger.getAttribute("aria-expanded") === "true" || trigger.dataset.state === "open"
      );
    const hasContext = openTrigger || legacyMenus.some(({ evidence }) => evidence.explicit);
    for (const { menu, evidence } of legacyMenus) {
      if (evidence.explicit || (hasContext && evidence.candidate)) hosts.add(menu);
    }
    return [...hosts];
  };

  const effortColumns = (snapshot) => {
    const columns = new Map();
    let fallbackOrder = effortOrder.length;
    for (const model of snapshot.models) {
      for (const effort of Array.isArray(model.efforts) ? model.efforts : []) {
        if (!effort?.id || columns.has(effort.id)) continue;
        columns.set(effort.id, {
          id: effort.id,
          label: effort.label || effort.id,
          order: effortRank(effort.id, fallbackOrder++)
        });
      }
    }
    return [...columns.values()].sort(
      (left, right) => left.order - right.order || left.label.localeCompare(right.label)
    );
  };
  const valuePick = (model) => {
    const scored = (Array.isArray(model.efforts) ? model.efforts : [])
      .map((effort, index) => {
        const comprehensive = safeScore(effort?.comprehensiveIq);
        const software = safeScore(effort?.softwareIq);
        if (!effort?.id || comprehensive == null || software == null) return null;
        return {
          id: effort.id,
          average: (comprehensive + software) / 2,
          rank: effortRank(effort.id, effortOrder.length + index)
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.rank - right.rank);
    if (scored.length < 2) return null;
    const peak = Math.max(...scored.map((effort) => effort.average));
    const highestRank = Math.max(...scored.map((effort) => effort.rank));
    const candidate = scored.find((effort) => effort.average >= peak * 0.95);
    return candidate && candidate.rank < highestRank ? candidate.id : null;
  };
  const metricNode = (kind, label, value) => {
    const metric = document.createElement("span");
    metric.className = `codex-efficiency-score codex-efficiency-score-${kind}`;
    const metricLabel = document.createElement("span");
    metricLabel.textContent = label;
    const score = document.createElement("strong");
    score.textContent = String(value);
    metric.append(metricLabel, score);
    return metric;
  };
  const createOption = (state, model, modelLabel, column, effort, isValuePick) => {
    const comprehensive = safeScore(effort?.comprehensiveIq);
    const software = safeScore(effort?.softwareIq);
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    cell.className = "codex-efficiency-option-cell";
    if (comprehensive == null && software == null) {
      return cell;
    }

    const option = document.createElement("button");
    option.type = "button";
    option.setAttribute(OPTION_ATTR, "true");
    option.setAttribute("aria-pressed", "false");
    option.dataset.modelId = model.id ?? "";
    option.dataset.effortId = column.id;
    option.dataset.valuePick = String(isValuePick);
    const badges = document.createElement("span");
    badges.className = "codex-efficiency-option-badges";
    const valueBadge = document.createElement("span");
    valueBadge.className = "codex-efficiency-badge codex-efficiency-badge-value";
    valueBadge.textContent = "优选";
    const currentBadge = document.createElement("span");
    currentBadge.className = "codex-efficiency-badge codex-efficiency-badge-current";
    currentBadge.textContent = "当前";
    badges.append(valueBadge, currentBadge);

    const optionHead = document.createElement("span");
    optionHead.className = "codex-efficiency-option-head";
    const effortLabel = document.createElement("span");
    effortLabel.className = "codex-efficiency-option-effort";
    effortLabel.textContent = column.label;
    const effortCode = document.createElement("small");
    effortCode.textContent = column.id.toUpperCase();
    effortLabel.append(effortCode);
    optionHead.append(effortLabel, badges);

    const pair = document.createElement("span");
    pair.className = "codex-efficiency-score-pair";
    if (comprehensive != null) pair.append(metricNode("comprehensive", "综合", comprehensive));
    if (software != null) pair.append(metricNode("software", "工程", software));
    option.append(optionHead, pair);

    const details = [];
    const softwareSamples = safeCount(effort?.softwareSamples);
    const visualSamples = safeCount(effort?.visualSamples);
    const runs24h = safeCount(effort?.runs24h);
    if (softwareSamples != null) details.push(`软件样本 ${softwareSamples}`);
    if (visualSamples != null) details.push(`视觉样本 ${visualSamples}`);
    if (runs24h != null) details.push(`24 小时运行 ${runs24h}`);
    if (isValuePick) details.push("优选：达到该模型峰值 95% 的最低档位");
    if (details.length) option.title = details.join("，");
    option.setAttribute(
      "aria-label",
      `${modelLabel}，${column.label}，综合智能 ${comprehensive ?? "无"}，软件工程 ${software ?? "无"}，点击选择`
    );
    option.addEventListener("pointerdown", (event) => event.stopPropagation());
    option.addEventListener("click", (event) =>
      state.requestSelection(event, option, model.id, column.id, `${modelLabel} · ${column.label}`)
    );
    cell.append(option);
    return cell;
  };
  const createGrid = (state, snapshot) => {
    const scroll = document.createElement("div");
    scroll.className = "codex-efficiency-map-scroll";
    const grid = document.createElement("div");
    grid.setAttribute(GRID_ATTR, "true");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Codex 模型与推理强度效率能力地图");
    const columns = effortColumns(snapshot);

    for (const model of snapshot.models) {
      const row = document.createElement("div");
      row.className = "codex-efficiency-map-row";
      row.setAttribute("role", "row");
      row.dataset.modelId = model.id ?? "";
      const modelName = document.createElement("span");
      modelName.className = "codex-efficiency-model-label";
      modelName.setAttribute("role", "rowheader");
      const modelLabel = model.label || model.shortLabel || model.id || "未知模型";
      const label = document.createElement("span");
      label.textContent = modelLabel;
      const id = document.createElement("small");
      id.textContent = model.id || "";
      modelName.append(label, id);
      row.append(modelName);
      const effortList = document.createElement("div");
      effortList.className = "codex-efficiency-effort-list";
      effortList.setAttribute("role", "presentation");
      const efforts = new Map(
        (Array.isArray(model.efforts) ? model.efforts : [])
          .filter((effort) => effort?.id)
          .map((effort) => [effort.id, effort])
      );
      const pick = valuePick(model);
      for (const column of columns) {
        const effort = efforts.get(column.id);
        if (safeScore(effort?.comprehensiveIq) == null && safeScore(effort?.softwareIq) == null) continue;
        effortList.append(createOption(
          state,
          model,
          modelLabel,
          column,
          effort,
          pick === column.id
        ));
      }
      row.append(effortList);
      grid.append(row);
    }
    scroll.append(grid);
    return scroll;
  };

  const readSelection = (root) => selector.read(root);

  const readableTime = (value) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    }).format(timestamp);
  };
  const statusPresentation = (state) => {
    if (state.refreshing) return { kind: "loading", text: "正在重新核对第三方数据…" };
    if (state.refreshError) return { kind: "error", text: state.refreshError };
    if (state.selectionState) return state.selectionState;
    const warnings = Array.isArray(state.snapshot.warnings)
      ? state.snapshot.warnings.filter((warning) => typeof warning === "string" && warning.trim())
      : [];
    const source = state.snapshot.source && typeof state.snapshot.source === "object"
      ? state.snapshot.source
      : {};
    const time = readableTime(source.dataUpdatedAt ?? source.checkedAt);
    if (warnings.length) {
      return { kind: "stale", text: `最近一次成功快照 · ${time}`, title: warnings.join(" ") };
    }
    if (source.refreshState === "stale") return { kind: "stale", text: `最近一次成功快照 · ${time}` };
    if (source.refreshState === "cooldown") return { kind: "cooldown", text: `源站共享缓存 · ${time}` };
    return { kind: "current", text: `第三方社区快照 · ${time}` };
  };
  const snapshotSignature = (snapshot) => {
    const source = JSON.stringify({ models: snapshot.models, source: snapshot.source, warnings: snapshot.warnings });
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${source.length}:${hash >>> 0}`;
  };
  const panelHeading = () => {
    const heading = document.createElement("div");
    heading.className = "codex-efficiency-panel-heading";
    const titleGroup = document.createElement("span");
    titleGroup.className = "codex-efficiency-panel-title";
    const title = document.createElement("strong");
    title.textContent = "效率能力地图";
    const hint = document.createElement("span");
    hint.textContent = "点击任意组合即可切换模型与推理档位";
    titleGroup.append(title, hint);
    const metrics = document.createElement("span");
    metrics.className = "codex-efficiency-panel-metrics";
    metrics.textContent = "综合智能 / 软件工程";
    heading.append(titleGroup, metrics);
    return heading;
  };
  const mapLegend = () => {
    const legend = document.createElement("div");
    legend.className = "codex-efficiency-map-legend";
    legend.textContent = "优选：以推理档位为成本代理，达到该模型峰值双指标均值 95% 的最低档";
    return legend;
  };
  const panelFooter = (state) => {
    const footer = document.createElement("div");
    footer.className = "codex-efficiency-panel-footer";
    const status = document.createElement("span");
    status.setAttribute(STATUS_ATTR, "true");
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.setAttribute(REFRESH_ATTR, "true");
    refresh.textContent = "刷新效率值";
    refresh.addEventListener("click", (event) => state.requestRefresh(event));
    footer.append(status, refresh);
    return footer;
  };
  const updateEntryControls = (state, root) => {
    const panel = root.querySelector(`[${PANEL_ATTR}]`);
    const entry = root.querySelector(`[${ENTRY_ATTR}]`);
    const refresh = root.querySelector(`[${REFRESH_ATTR}]`);
    const status = root.querySelector(`[${STATUS_ATTR}]`);
    if (!panel || !entry || !refresh || !status) return;
    entry.setAttribute("aria-expanded", String(!panel.hidden));
    root.dataset.expanded = String(!panel.hidden);
    const surface = root.closest('[role="menu"]');
    if (surface) {
      const open = [...surface.querySelectorAll(`[${PANEL_ATTR}]`)].some((candidate) => !candidate.hidden);
      if (open) surface.setAttribute(SURFACE_EXPANDED_ATTR, "true");
      else surface.removeAttribute(SURFACE_EXPANDED_ATTR);
    }
    setText(root.querySelector(".codex-efficiency-entry-summary"), `${state.snapshot.models.length} 个模型`);
    refresh.toggleAttribute("disabled", state.refreshing);
    refresh.dataset.loading = String(state.refreshing);
    setText(refresh, state.refreshing ? "正在刷新…" : "刷新效率值");
    const selected = readSelection(root);
    for (const option of root.querySelectorAll(`[${OPTION_ATTR}]`)) {
      const active = selected.model?.id === option.dataset.modelId && selected.effort === option.dataset.effortId;
      option.dataset.selected = String(active);
      option.setAttribute("aria-pressed", String(active));
      option.toggleAttribute("disabled", Boolean(state.selecting));
    }
    const presentation = statusPresentation(state);
    root.dataset.state = presentation.kind;
    setText(status, presentation.text);
    if (presentation.title) status.title = presentation.title;
    else status.removeAttribute("title");
  };
  const renderEntry = (state, root, force = false) => {
    const signature = snapshotSignature(state.snapshot);
    const panel = root.querySelector(`[${PANEL_ATTR}]`);
    if (!panel) return;
    if (force || root.dataset.signature !== signature) {
      const hidden = panel.hidden;
      panel.replaceChildren(panelHeading(), createGrid(state, state.snapshot), mapLegend(), panelFooter(state));
      panel.hidden = hidden;
      root.dataset.signature = signature;
    }
    updateEntryControls(state, root);
  };
  const createEntry = (state, host) => {
    const existing = [...host.children].find((child) => child.hasAttribute?.(ROOT_ATTR));
    if (existing) return existing;
    const root = document.createElement("div");
    root.setAttribute(ROOT_ATTR, "true");
    const panelId = `codex-efficiency-panel-${state.nextEntryId++}`;
    if (host.getAttribute?.("role") === "menu") root.setAttribute("role", "none");
    const entry = document.createElement("button");
    entry.type = "button";
    entry.setAttribute(ENTRY_ATTR, "true");
    if (host.getAttribute?.("role") === "menu") entry.setAttribute("role", "menuitem");
    entry.setAttribute("aria-controls", panelId);
    entry.setAttribute("aria-expanded", "false");
    const icon = document.createElement("span");
    icon.className = "codex-efficiency-entry-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "◇";
    const label = document.createElement("span");
    label.className = "codex-efficiency-entry-label";
    label.textContent = "查看效率地图";
    const summary = document.createElement("span");
    summary.className = "codex-efficiency-entry-summary";
    const chevron = document.createElement("span");
    chevron.className = "codex-efficiency-entry-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    entry.append(icon, label, summary, chevron);
    const panel = document.createElement("section");
    panel.id = panelId;
    panel.hidden = true;
    panel.setAttribute(PANEL_ATTR, "true");
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Codex 效率能力地图");
    entry.addEventListener("pointerdown", (event) => event.stopPropagation());
    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.toggleEntry(root);
    });
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("click", (event) => event.stopPropagation());
    root.addEventListener("keydown", (event) => event.stopPropagation());
    root.append(entry, panel);
    host.append(root);
    return root;
  };

  const existingState = window[ROOT_KEY];
  if (existingState && existingState.version !== OVERLAY_VERSION) {
    existingState.observer?.disconnect();
    if (existingState.refreshTimer) clearTimeout(existingState.refreshTimer);
    for (const root of document.querySelectorAll(`[${ROOT_ATTR}]`)) root.remove();
    delete window[ROOT_KEY];
  }
  cleanupObsoleteUi();

  const state = window[ROOT_KEY] ?? {
    version: OVERLAY_VERSION,
    selectorContract: nextSelectorContract,
        snapshot: nextSnapshot,
        scheduled: false,
        forceRender: false,
    observer: null,
    openEntry: null,
    refreshing: false,
    refreshTimer: null,
    refreshGeneration: 0,
    refreshError: null,
    selecting: null,
    selectionState: null,
    nextEntryId: 1,
    render(force = false) {
      ensureStyle();
      cleanupObsoleteUi();
      if (this.openEntry && !this.openEntry.isConnected) this.openEntry = null;
      for (const host of findSurfaceHosts(this.snapshot)) createEntry(this, host);
      for (const root of document.querySelectorAll(`[${ROOT_ATTR}]`)) renderEntry(this, root, force);
        },
        schedule(force = false) {
          this.forceRender ||= force;
          if (this.scheduled) return;
          this.scheduled = true;
          queueMicrotask(() => {
            this.scheduled = false;
            const shouldForce = this.forceRender;
            this.forceRender = false;
            this.render(shouldForce);
          });
    },
    toggleEntry(root) {
      const panel = root.querySelector(`[${PANEL_ATTR}]`);
      if (!panel) return;
      const shouldOpen = panel.hidden;
      if (shouldOpen && this.openEntry && this.openEntry !== root) {
        const previous = this.openEntry.querySelector(`[${PANEL_ATTR}]`);
        if (previous) previous.hidden = true;
        updateEntryControls(this, this.openEntry);
      }
      panel.hidden = !shouldOpen;
      this.openEntry = shouldOpen ? root : null;
      updateEntryControls(this, root);
    },
    updateAllControls() {
      for (const root of document.querySelectorAll(`[${ROOT_ATTR}]`)) updateEntryControls(this, root);
    },
    async requestSelection(event, option, modelId, effortId, label) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.selecting || !modelId || !effortId) return;
      this.selecting = { modelId, effortId };
      this.selectionState = { kind: "selecting", text: `正在切换到 ${label}…` };
      this.updateAllControls();
      try {
        await selector.select(option, modelId, effortId);
        this.selectionState = { kind: "current", text: `已切换到 ${label}` };
      } catch (error) {
        this.selectionState = { kind: "error", text: `切换失败：${error?.message || "未知错误"}` };
      } finally {
        this.selecting = null;
        this.updateAllControls();
      }
    },
    failRefresh(message, generation = this.refreshGeneration) {
      if (generation !== this.refreshGeneration || !this.refreshing) return;
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.refreshing = false;
      this.refreshError = `刷新失败：${message || "未知错误"}`;
      this.updateAllControls();
    },
    requestRefresh(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.refreshing) return;
      const generation = ++this.refreshGeneration;
      this.refreshing = true;
      this.refreshError = null;
      this.selectionState = null;
      this.updateAllControls();
      try {
        if (typeof window.codexEfficiencyRefresh !== "function") throw new Error("刷新桥接未连接");
        const result = window.codexEfficiencyRefresh(JSON.stringify({ requestedAt: Date.now(), force: true }));
        if (result && typeof result.then === "function") {
          result.catch((error) => this.failRefresh(error?.message, generation));
        }
        this.refreshTimer = setTimeout(
          () => this.failRefresh("等待数据返回超时，请重试", generation),
          REFRESH_TIMEOUT_MS
        );
        this.refreshTimer?.unref?.();
      } catch (error) {
        this.failRefresh(error?.message, generation);
      }
    },
    updateSnapshot(snapshot, selectorContract) {
      this.snapshot = snapshot;
      this.selectorContract = selectorContract;
      selector.update(snapshot, selectorContract);
      this.refreshGeneration += 1;
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.refreshing = false;
      this.refreshError = null;
      this.selectionState = null;
      this.schedule(true);
    }
  };

      if (!window[ROOT_KEY]) {
        window[ROOT_KEY] = state;
        state.observer = new MutationObserver((mutations) => {
          const relevant = mutations.some((mutation) =>
            !mutation.target?.closest?.(`[${ROOT_ATTR}]`)
          );
          if (relevant) state.schedule();
        });
        state.observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["aria-hidden", "data-state", "hidden"],
          childList: true,
          subtree: true
        });
      }
  state.updateSnapshot(nextSnapshot, nextSelectorContract);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildInjectionSource(snapshot, selectorContract = "auto") {
  const bridge = buildSelectorBridgeSource(snapshot, selectorContract);
  const overlay = `(${installEfficiencyOverlay.toString()})(${safeJson(snapshot)},${safeJson(OVERLAY_CSS)},${safeJson(selectorContract)});`;
  return `${bridge}${overlay}`;
}
