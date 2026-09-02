function installEfficiencyOverlay(nextSnapshot) {
  const ROOT_KEY = "__codexEfficiencyRadarOverlay";
  const OVERLAY_VERSION = 6;
  const STYLE_ID = "codex-efficiency-radar-style";
  const ROOT_ATTR = "data-codex-efficiency-root";
  const ENTRY_ATTR = "data-codex-efficiency-entry";
  const PANEL_ATTR = "data-codex-efficiency-panel";
  const TABLE_ATTR = "data-codex-efficiency-table";
  const REFRESH_ATTR = "data-codex-efficiency-refresh";
  const STATUS_ATTR = "data-codex-efficiency-status";
  const SURFACE_EXPANDED_ATTR = "data-codex-efficiency-expanded";
  const LEGACY_BADGE_ATTR = "data-codex-efficiency-badges";
  const LEGACY_ROW_ATTR = "data-codex-efficiency-row";
  const REFRESH_TIMEOUT_MS = 30_000;

  const effortOrder = ["low", "medium", "high", "xhigh", "max", "ultra"];
  const effortAliases = {
    low: ["轻度", "低", "low", "light"],
    medium: ["中", "标准", "medium", "standard"],
    high: ["高", "high", "extended"],
    xhigh: ["极高", "xhigh", "extrahigh"],
    max: ["最高", "max", "maximum"],
    ultra: ["ultra"]
  };
  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/gpt/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
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
    if (!value) return null;
    return snapshot.models.find((model) =>
      [model.id, model.label, model.shortLabel]
        .filter(Boolean)
        .some((alias) => {
          const normalizedAlias = normalize(alias);
          return normalizedAlias && value.includes(normalizedAlias);
        })
    ) ?? null;
  };

  const ensureStyle = () => {
    const style = document.getElementById(STYLE_ID) ?? document.createElement("style");
    const css = `
      [${ROOT_ATTR}] {
        --cer-border: color-mix(in srgb, currentColor 20%, transparent);
        --cer-border-strong: color-mix(in srgb, currentColor 38%, transparent);
        --cer-surface: color-mix(in srgb, Canvas 94%, currentColor 6%);
        --cer-surface-raised: color-mix(in srgb, Canvas 84%, currentColor 16%);
        border-block-start: 2px solid var(--cer-border-strong);
        box-sizing: border-box;
        color: inherit;
        flex: 0 0 auto;
        font: inherit;
        margin-block-start: 8px;
        padding: 8px;
        width: 100%;
      }
      [${ROOT_ATTR}], [${ROOT_ATTR}] * { box-sizing: border-box; }
      [role="menu"][${SURFACE_EXPANDED_ATTR}] {
        max-width: calc(100vw - 32px) !important;
        width: min(760px, calc(100vw - 32px)) !important;
      }
      [${ENTRY_ATTR}] {
        align-items: center;
        appearance: none;
        background: transparent;
        border: 0;
        border-radius: 8px;
        color: inherit;
        cursor: pointer;
        display: flex;
        font: inherit;
        gap: 10px;
        justify-content: flex-start;
        min-height: 42px;
        padding: 9px 10px;
        text-align: start;
        width: 100%;
      }
      [${ENTRY_ATTR}]:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
      [${ENTRY_ATTR}]:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
      [${ENTRY_ATTR}] .codex-efficiency-entry-icon {
        align-items: center;
        border: 1px solid var(--cer-border-strong);
        border-radius: 6px;
        display: inline-flex;
        font-size: 14px;
        font-weight: 700;
        height: 24px;
        justify-content: center;
        width: 24px;
      }
      [${ENTRY_ATTR}] .codex-efficiency-entry-label { font-size: 14px; font-weight: 700; letter-spacing: .01em; }
      [${ENTRY_ATTR}] .codex-efficiency-entry-summary {
        font-size: 11px;
        margin-inline-start: auto;
        opacity: .78;
        white-space: nowrap;
      }
      [${ENTRY_ATTR}] .codex-efficiency-entry-chevron {
        display: inline-block;
        font-size: 16px;
        opacity: .78;
        transform: rotate(0deg);
        transition: transform 160ms ease;
      }
      [${ENTRY_ATTR}][aria-expanded="true"] .codex-efficiency-entry-chevron { transform: rotate(180deg); }
      [${PANEL_ATTR}] {
        background: var(--cer-surface);
        border: 1px solid var(--cer-border);
        border-radius: 12px;
        box-shadow: 0 3px 14px color-mix(in srgb, currentColor 10%, transparent);
        margin-block-start: 8px;
        overflow: hidden;
      }
      [${PANEL_ATTR}][hidden] { display: none !important; }
      .codex-efficiency-panel-heading {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        justify-content: space-between;
        padding: 12px 14px 10px;
      }
      .codex-efficiency-panel-heading strong { font-size: 14px; font-weight: 750; letter-spacing: .01em; }
      .codex-efficiency-panel-heading span { font-size: 11px; font-weight: 550; opacity: .82; }
      .codex-efficiency-table-scroll {
        max-height: min(360px, 55vh);
        overflow: auto;
        overscroll-behavior: contain;
        scrollbar-color: color-mix(in srgb, currentColor 36%, transparent) transparent;
      }
      [${TABLE_ATTR}] {
        border-collapse: separate;
        border-spacing: 0;
        font-size: 12px;
        min-width: 680px;
        width: 100%;
      }
      [${TABLE_ATTR}] th, [${TABLE_ATTR}] td {
        border-block-start: 1px solid var(--cer-border);
        padding: 10px 12px;
        text-align: start;
        vertical-align: middle;
      }
      [${TABLE_ATTR}] thead th {
        background: var(--cer-surface-raised);
        font-size: 12px;
        font-weight: 750;
        inset-block-start: 0;
        position: sticky;
        white-space: nowrap;
        z-index: 2;
      }
      [${TABLE_ATTR}] thead th small { display: block; font-size: 10px; font-weight: 600; letter-spacing: .04em; opacity: .72; }
      [${TABLE_ATTR}] tbody tr:nth-child(even) { background: color-mix(in srgb, currentColor 4%, transparent); }
      [${TABLE_ATTR}] tbody tr:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
      [${TABLE_ATTR}] tbody th {
        background: var(--cer-surface);
        box-shadow: 1px 0 0 var(--cer-border-strong);
        font-size: 12px;
        font-weight: 750;
        inset-inline-start: 0;
        min-width: 150px;
        position: sticky;
        white-space: nowrap;
        z-index: 1;
      }
      [${TABLE_ATTR}] td { min-width: 92px; }
      .codex-efficiency-score-pair { display: grid; gap: 6px; }
      .codex-efficiency-score {
        align-items: baseline;
        display: flex;
        gap: 7px;
        justify-content: space-between;
        line-height: 1.35;
        white-space: nowrap;
      }
      .codex-efficiency-score span {
        background: color-mix(in srgb, currentColor 10%, transparent);
        border: 1px solid var(--cer-border);
        border-radius: 5px;
        font-size: 10px;
        font-weight: 750;
        min-width: 34px;
        opacity: .92;
        padding: 2px 4px;
        text-align: center;
      }
      .codex-efficiency-score strong { font-size: 15px; font-variant-numeric: tabular-nums; }
      .codex-efficiency-score-software { opacity: .82; }
      .codex-efficiency-empty { font-size: 13px; opacity: .58; text-align: center; }
      .codex-efficiency-panel-footer {
        align-items: center;
        border-block-start: 1px solid var(--cer-border);
        display: flex;
        flex-wrap: wrap;
        gap: 6px 8px;
        justify-content: space-between;
        padding: 10px 12px;
      }
      [${STATUS_ATTR}] {
        align-items: center;
        display: inline-flex;
        flex: 1 1 130px;
        font-size: 10px;
        gap: 6px;
        line-height: 1.45;
        min-width: 0;
        opacity: .68;
      }
      [${STATUS_ATTR}]::before {
        background: currentColor;
        border-radius: 999px;
        content: "";
        flex: 0 0 auto;
        height: 6px;
        opacity: .72;
        width: 6px;
      }
      [${ROOT_ATTR}][data-state="stale"] [${STATUS_ATTR}],
      [${ROOT_ATTR}][data-state="error"] [${STATUS_ATTR}] { opacity: .92; }
      [${REFRESH_ATTR}] {
        appearance: none;
        background: transparent;
        border: 1px solid var(--cer-border-strong);
        border-radius: 8px;
        color: inherit;
        cursor: pointer;
        flex: 0 0 auto;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        min-height: 36px;
        padding: 7px 12px;
      }
      [${REFRESH_ATTR}]:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
      [${REFRESH_ATTR}]:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
      [${REFRESH_ATTR}][data-loading="true"] { cursor: wait; opacity: .55; }
      @media (prefers-reduced-motion: reduce) {
        [${ENTRY_ATTR}] .codex-efficiency-entry-chevron { transition: none; }
      }
    `;
    if (!style.id) style.id = STYLE_ID;
    if (style.textContent !== css) style.textContent = css;
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
      const hasOpenPanel = [...surface.querySelectorAll(`[${PANEL_ATTR}]`)]
        .some((panel) => !panel.hidden);
      if (!hasOpenPanel) surface.removeAttribute(SURFACE_EXPANDED_ATTR);
    }
  };
  const directMenuItems = (menu) =>
    [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"], [role="menuitem"]')]
      .filter((item) => item.closest('[role="menu"]') === menu);

  const legacyMenuEvidence = (menu, snapshot) => {
    const hasPickerMarker = Boolean(menu.querySelector(
      "[data-model-selected], [data-reasoning-selected], [data-model-picker-model-row], " +
      "[data-model-picker-view-toggle], [data-reasoning-slider]"
    ));
    const items = directMenuItems(menu);
    const efforts = new Set(items.map((item) => identifyEffort(item.textContent)).filter(Boolean));
    const models = new Set(
      items.map((item) => identifyModel(item.textContent, snapshot)?.id).filter(Boolean)
    );
    const text = menu.textContent ?? "";
    const mentionsModel = /模型|model/i.test(text);
    const mentionsReasoning = /推理强度|推理|reasoning|effort/i.test(text);
    return {
      explicit: hasPickerMarker || (mentionsModel && mentionsReasoning),
      candidate: efforts.size >= 2 || models.size >= 2
    };
  };

  const findSurfaceHosts = (snapshot) => {
    const hosts = new Set();

    for (const picker of document.querySelectorAll("[data-model-picker-view]")) {
      let foundPanel = false;
      for (const track of picker.children) {
        if (track.hasAttribute?.(ROOT_ATTR)) continue;
        const panel = track.firstElementChild;
        if (!panel || panel.hasAttribute?.(ROOT_ATTR)) continue;
        hosts.add(panel);
        foundPanel = true;
      }
      if (!foundPanel) hosts.add(picker);
    }

    const legacyMenus = [...document.querySelectorAll('[role="menu"]')]
      .filter((menu) => !menu.closest(`[${ROOT_ATTR}]`))
      .filter((menu) =>
        !menu.closest("[data-model-picker-view]") && !menu.querySelector("[data-model-picker-view]")
      )
      .map((menu) => ({ menu, evidence: legacyMenuEvidence(menu, snapshot) }));
    const openTrigger = [...document.querySelectorAll("[data-codex-intelligence-trigger]")]
      .some((trigger) =>
        trigger.getAttribute("aria-expanded") === "true" || trigger.dataset.state === "open"
      );
    const hasPickerContext = openTrigger || legacyMenus.some(({ evidence }) => evidence.explicit);
    for (const { menu, evidence } of legacyMenus) {
      if (evidence.explicit || (hasPickerContext && evidence.candidate)) hosts.add(menu);
    }
    return [...hosts];
  };

  const effortColumns = (snapshot) => {
    const columns = new Map();
    let fallbackOrder = effortOrder.length;
    for (const model of snapshot.models) {
      for (const effort of Array.isArray(model.efforts) ? model.efforts : []) {
        if (!effort?.id || columns.has(effort.id)) continue;
        const knownOrder = effortOrder.indexOf(effort.id);
        columns.set(effort.id, {
          id: effort.id,
          label: effort.label || effort.id,
          order: knownOrder === -1 ? fallbackOrder++ : knownOrder
        });
      }
    }
    return [...columns.values()].sort(
      (left, right) => left.order - right.order || left.label.localeCompare(right.label)
    );
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

  const createTable = (snapshot) => {
    const scroll = document.createElement("div");
    scroll.className = "codex-efficiency-table-scroll";
    const table = document.createElement("table");
    table.setAttribute(TABLE_ATTR, "true");
    table.setAttribute("aria-label", "Codex 模型与推理强度效率值");

    const columns = effortColumns(snapshot);
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const modelHeader = document.createElement("th");
    modelHeader.scope = "col";
    modelHeader.textContent = "模型";
    headRow.append(modelHeader);
    for (const column of columns) {
      const header = document.createElement("th");
      header.scope = "col";
      header.dataset.effortId = column.id;
      const label = document.createElement("span");
      label.textContent = column.label;
      const code = document.createElement("small");
      code.textContent = column.id.toUpperCase();
      header.append(label, code);
      headRow.append(header);
    }
    head.append(headRow);

    const body = document.createElement("tbody");
    for (const model of snapshot.models) {
      const row = document.createElement("tr");
      row.dataset.modelId = model.id ?? "";
      const modelName = document.createElement("th");
      modelName.scope = "row";
      modelName.textContent = model.label || model.shortLabel || model.id || "未知模型";
      row.append(modelName);

      const efforts = new Map(
        (Array.isArray(model.efforts) ? model.efforts : [])
          .filter((effort) => effort?.id)
          .map((effort) => [effort.id, effort])
      );
      for (const column of columns) {
        const cell = document.createElement("td");
        cell.dataset.effortId = column.id;
        const effort = efforts.get(column.id);
        const comprehensive = safeScore(effort?.comprehensiveIq);
        const software = safeScore(effort?.softwareIq);
        if (comprehensive == null && software == null) {
          cell.className = "codex-efficiency-empty";
          cell.textContent = "—";
        } else {
          const pair = document.createElement("span");
          pair.className = "codex-efficiency-score-pair";
          if (comprehensive != null) pair.append(metricNode("comprehensive", "综合", comprehensive));
          if (software != null) pair.append(metricNode("software", "工程", software));
          cell.append(pair);
          const details = [];
          const softwareSamples = safeCount(effort?.softwareSamples);
          const visualSamples = safeCount(effort?.visualSamples);
          const runs24h = safeCount(effort?.runs24h);
          if (softwareSamples != null) details.push(`软件样本 ${softwareSamples}`);
          if (visualSamples != null) details.push(`视觉样本 ${visualSamples}`);
          if (runs24h != null) details.push(`24 小时运行 ${runs24h}`);
          if (details.length) cell.title = details.join("，");
          cell.setAttribute(
            "aria-label",
            `${modelName.textContent}，${column.label}，综合智能 ${comprehensive ?? "无"}，软件工程 ${software ?? "无"}`
          );
        }
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    scroll.append(table);
    return scroll;
  };

  const readableTime = (value) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(timestamp);
  };
  const statusPresentation = (state) => {
    if (state.refreshing) return { kind: "loading", text: "正在重新核对第三方数据…" };
    if (state.transientError) return { kind: "error", text: state.transientError };

    const snapshot = state.snapshot;
    const warnings = Array.isArray(snapshot.warnings)
      ? snapshot.warnings.filter((warning) => typeof warning === "string" && warning.trim())
      : [];
    const source = snapshot.source && typeof snapshot.source === "object" ? snapshot.source : {};
    const time = readableTime(source.dataUpdatedAt ?? source.checkedAt);
    if (warnings.length) {
      return { kind: "stale", text: `最近一次成功快照 · ${time}`, title: warnings.join(" ") };
    }
    if (source.refreshState === "stale") {
      return { kind: "stale", text: `最近一次成功快照 · ${time}` };
    }
    if (source.refreshState === "cooldown") {
      return { kind: "cooldown", text: `源站共享缓存 · ${time}` };
    }
    return { kind: "current", text: `第三方社区快照 · ${time}` };
  };

  const snapshotSignature = (snapshot) => {
    const source = JSON.stringify({
      models: snapshot.models,
      source: snapshot.source,
      warnings: snapshot.warnings
    });
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
    const title = document.createElement("strong");
    title.textContent = "效率值矩阵 · 模型 × 推理强度";
    const legend = document.createElement("span");
    legend.textContent = "综合智能 / 软件工程";
    heading.append(title, legend);
    return heading;
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
    const summary = root.querySelector(".codex-efficiency-entry-summary");
    if (!panel || !entry || !refresh || !status) return;

    entry.setAttribute("aria-expanded", String(!panel.hidden));
    root.dataset.expanded = String(!panel.hidden);
    const surface = root.closest('[role="menu"]');
    if (surface) {
      const hasOpenPanel = [...surface.querySelectorAll(`[${PANEL_ATTR}]`)]
        .some((candidate) => !candidate.hidden);
      if (hasOpenPanel) surface.setAttribute(SURFACE_EXPANDED_ATTR, "true");
      else surface.removeAttribute(SURFACE_EXPANDED_ATTR);
    }
    setText(summary, `${state.snapshot.models.length} 个模型`);
    if (state.refreshing) refresh.setAttribute("disabled", "");
    else refresh.removeAttribute("disabled");
    refresh.dataset.loading = String(state.refreshing);
    setText(refresh, state.refreshing ? "正在刷新…" : "刷新效率值");

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
      const wasHidden = panel.hidden;
      panel.replaceChildren(panelHeading(), createTable(state.snapshot), panelFooter(state));
      panel.hidden = wasHidden;
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

    const entry = document.createElement("button");
    entry.type = "button";
    entry.setAttribute(ENTRY_ATTR, "true");
    if (host.getAttribute?.("role") === "menu") entry.setAttribute("role", "menuitem");
    entry.setAttribute("aria-controls", panelId);
    entry.setAttribute("aria-expanded", "false");
    const icon = document.createElement("span");
    icon.className = "codex-efficiency-entry-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▦";
    const label = document.createElement("span");
    label.className = "codex-efficiency-entry-label";
    label.textContent = "查看效率值";
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
    panel.setAttribute("aria-label", "Codex 效率值表格");

    entry.addEventListener("pointerdown", (event) => event.stopPropagation());
    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.toggleEntry(root);
    });
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("click", (event) => event.stopPropagation());
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
    snapshot: nextSnapshot,
    scheduled: false,
    observer: null,
    openEntry: null,
    refreshing: false,
    refreshTimer: null,
    refreshGeneration: 0,
    transientError: null,
    nextEntryId: 1,
    render(force = false) {
      ensureStyle();
      cleanupObsoleteUi();
      if (this.openEntry && !this.openEntry.isConnected) this.openEntry = null;
      for (const host of findSurfaceHosts(this.snapshot)) createEntry(this, host);
      for (const root of document.querySelectorAll(`[${ROOT_ATTR}]`)) {
        renderEntry(this, root, force);
      }
    },
    schedule(force = false) {
      if (this.scheduled) return;
      this.scheduled = true;
      requestAnimationFrame(() => {
        this.scheduled = false;
        this.render(force);
      });
    },
    toggleEntry(root) {
      const panel = root.querySelector(`[${PANEL_ATTR}]`);
      if (!panel) return;
      const shouldOpen = panel.hidden;
      if (shouldOpen && this.openEntry && this.openEntry !== root) {
        const previousPanel = this.openEntry.querySelector(`[${PANEL_ATTR}]`);
        if (previousPanel) previousPanel.hidden = true;
        updateEntryControls(this, this.openEntry);
      }
      panel.hidden = !shouldOpen;
      this.openEntry = shouldOpen ? root : null;
      updateEntryControls(this, root);
    },
    updateAllControls() {
      for (const root of document.querySelectorAll(`[${ROOT_ATTR}]`)) {
        updateEntryControls(this, root);
      }
    },
    failRefresh(message, generation = this.refreshGeneration) {
      if (generation !== this.refreshGeneration || !this.refreshing) return;
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.refreshing = false;
      this.transientError = `刷新失败：${message || "未知错误"}`;
      this.updateAllControls();
    },
    requestRefresh(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (this.refreshing) return;
      const generation = ++this.refreshGeneration;
      this.refreshing = true;
      this.transientError = null;
      this.updateAllControls();
      try {
        if (typeof window.codexEfficiencyRefresh !== "function") {
          throw new Error("刷新桥接未连接");
        }
        const result = window.codexEfficiencyRefresh(
          JSON.stringify({ requestedAt: Date.now(), force: true })
        );
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
    updateSnapshot(snapshot) {
      this.snapshot = snapshot;
      this.refreshGeneration += 1;
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.refreshing = false;
      this.transientError = null;
      this.schedule(true);
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
