(() => {
  const elements = {
    modelSelect: document.getElementById("model-select"),
    refreshButton: document.getElementById("refresh-button"),
    scoreList: document.getElementById("score-list"),
    panel: document.querySelector(".score-panel"),
    statusStrip: document.getElementById("status-strip"),
    statusCopy: document.getElementById("status-copy"),
    sourceTime: document.getElementById("source-time"),
    cacheStatus: document.getElementById("cache-status")
  };

  const state = {
    snapshot: null,
    selectedModel: null,
    pendingRequests: new Map(),
    nextRequestId: 1,
    loading: false
  };

  function safeText(value, fallback = "—") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function safeScore(value) {
    const score = Number(value);
    return Number.isFinite(score) && score >= 0 && score <= 150 ? Math.round(score) : null;
  }

  function safeDate(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(timestamp);
  }

  function isSnapshot(value) {
    return Boolean(value && typeof value === "object" && Array.isArray(value.models));
  }

  function modelById(modelId) {
    return state.snapshot?.models?.find((model) => model?.id === modelId) ?? null;
  }

  function updateStatus(message, status = "current") {
    elements.statusStrip.dataset.state = status;
    elements.statusCopy.textContent = message;
  }

  function setLoading(loading) {
    state.loading = loading;
    elements.refreshButton.disabled = loading;
    elements.refreshButton.classList.toggle("is-loading", loading);
    elements.panel.setAttribute("aria-busy", String(loading));
  }

  function createScoreMeter(kind, label, abbreviation, score) {
    const meter = document.createElement("div");
    meter.className = `score-meter ${kind}`;
    meter.style.setProperty("--score-width", `${Math.min(100, Math.max(0, (score / 150) * 100))}%`);

    const content = document.createElement("div");
    content.className = "score-content";

    const metric = document.createElement("span");
    metric.className = "metric-tag";
    metric.dataset.abbr = abbreviation;
    const metricText = document.createElement("span");
    metricText.textContent = label;
    metric.append(metricText);

    const value = document.createElement("strong");
    value.className = "score-value";
    value.textContent = String(score);
    value.setAttribute("aria-label", `${label} ${score}`);

    content.append(metric, value);
    meter.append(content);
    return meter;
  }

  function renderScores(model) {
    elements.scoreList.replaceChildren();
    const efforts = Array.isArray(model?.efforts) ? model.efforts : [];
    if (!efforts.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "该模型暂无可匹配的效率数据。";
      elements.scoreList.append(empty);
      return;
    }

    for (const [index, effort] of efforts.entries()) {
      const comprehensive = safeScore(effort?.comprehensiveIq);
      const software = safeScore(effort?.softwareIq);
      if (comprehensive == null || software == null) continue;

      const row = document.createElement("article");
      row.className = "score-row";
      row.style.animationDelay = `${index * 36}ms`;

      const effortLabel = document.createElement("div");
      effortLabel.className = "effort-label";
      const label = document.createElement("span");
      label.textContent = safeText(effort?.label, safeText(effort?.id));
      const code = document.createElement("small");
      code.textContent = safeText(effort?.id);
      effortLabel.append(label, code);

      const scorePair = document.createElement("div");
      scorePair.className = "score-pair";
      scorePair.append(
        createScoreMeter("comprehensive", "综合", "综", comprehensive),
        createScoreMeter("software", "工程", "工", software)
      );

      row.append(effortLabel, scorePair);
      elements.scoreList.append(row);
    }
  }

  function renderModelOptions() {
    const previous = state.selectedModel;
    elements.modelSelect.replaceChildren();

    for (const model of state.snapshot.models) {
      if (!model || typeof model.id !== "string") continue;
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = safeText(model.label, model.id);
      elements.modelSelect.append(option);
    }

    const fallback = safeText(state.snapshot.selectedModel, elements.modelSelect.options[0]?.value);
    state.selectedModel = modelById(previous) ? previous : fallback;
    elements.modelSelect.value = state.selectedModel;
  }

  function refreshStatusCopy(source, warnings) {
    const stateLabel = {
      current: "已读取最新可用快照",
      cooldown: "源端处于共享刷新冷却，当前显示缓存快照",
      stale: "源端快照可能已过期"
    }[source.refreshState] ?? "已读取效率快照";

    if (warnings.length) {
      updateStatus(warnings.join(" "), "stale");
      return;
    }

    const suffix = source.memoryCache ? " · 本地缓存" : "";
    updateStatus(`${stateLabel}${suffix}`, source.refreshState ?? "current");
  }

  function render(snapshot) {
    if (!isSnapshot(snapshot) || !snapshot.models.length) {
      updateStatus("收到的数据格式无效，无法显示效率值。", "error");
      return;
    }

    state.snapshot = snapshot;
    state.selectedModel = safeText(snapshot.selectedModel, snapshot.models[0]?.id);
    renderModelOptions();
    renderScores(modelById(state.selectedModel));

    const source = snapshot.source && typeof snapshot.source === "object" ? snapshot.source : {};
    const warnings = Array.isArray(snapshot.warnings)
      ? snapshot.warnings.filter((warning) => typeof warning === "string")
      : [];
    elements.sourceTime.textContent = `数据时间：${safeDate(source.dataUpdatedAt)}`;
    elements.cacheStatus.textContent = `源端缓存：${safeText(source.softwareCache)} / ${safeText(source.visualCache)}`;
    refreshStatusCopy(source, warnings);
    setLoading(false);
  }

  function extractStructuredContent(result) {
    if (isSnapshot(result?.structuredContent)) return result.structuredContent;
    if (isSnapshot(result?.result?.structuredContent)) return result.result.structuredContent;
    if (isSnapshot(result)) return result;
    return null;
  }

  function request(method, params) {
    const id = state.nextRequestId++;
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        state.pendingRequests.delete(id);
        reject(new Error("刷新请求超时。"));
      }, 20_000);
      state.pendingRequests.set(id, {
        resolve: (value) => { window.clearTimeout(timeout); resolve(value); },
        reject: (error) => { window.clearTimeout(timeout); reject(error); }
      });
    });
  }

  async function callRefreshTool() {
    const args = { force: true, model: state.selectedModel };
    if (window.openai?.callTool) {
      return window.openai.callTool("refresh_efficiency_values", args);
    }
    return request("tools/call", { name: "refresh_efficiency_values", arguments: args });
  }

  async function refresh() {
    if (state.loading) return;
    setLoading(true);
    updateStatus("正在重新核对两类能力数据…", "current");
    try {
      const result = await callRefreshTool();
      const snapshot = extractStructuredContent(result);
      if (!snapshot) throw new Error("刷新结果中没有有效数据。会话宿主可能尚未启用组件工具调用。 ");
      render(snapshot);
    } catch (error) {
      updateStatus(`刷新失败：${safeText(error?.message, "未知错误")}`, "error");
      setLoading(false);
    }
  }

  function handleMessage(event) {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;

    if (message.id !== undefined && state.pendingRequests.has(message.id)) {
      const pending = state.pendingRequests.get(message.id);
      state.pendingRequests.delete(message.id);
      if (message.error) pending.reject(new Error(safeText(message.error.message, "工具调用失败。")));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === "ui/notifications/tool-result") {
      const snapshot = extractStructuredContent(message.params);
      if (snapshot) render(snapshot);
    }
  }

  elements.modelSelect.addEventListener("change", () => {
    state.selectedModel = elements.modelSelect.value;
    renderScores(modelById(state.selectedModel));
    window.openai?.setWidgetState?.({
      modelContent: `当前查看 ${safeText(modelById(state.selectedModel)?.label)} 的效率数据。`,
      privateContent: { selectedModel: state.selectedModel }
    });
  });
  elements.refreshButton.addEventListener("click", refresh);
  window.addEventListener("message", handleMessage, { passive: true });

  const initial = window.__EFFICIENCY_RADAR_PREVIEW__
    ?? window.openai?.toolOutput
    ?? null;
  if (isSnapshot(initial)) render(initial);
})();
