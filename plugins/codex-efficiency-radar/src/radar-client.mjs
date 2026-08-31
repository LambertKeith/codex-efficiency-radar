const DEFAULT_BASE_URL = "https://codexradar.com";
const SOFTWARE_PATH = "/api/intelligence-efficiency-metrics";
const VISUAL_PATH = "/api/visual-spatial-reasoning";

const EFFORT_INFO = Object.freeze({
  low: { label: "轻度", order: 0 },
  medium: { label: "中", order: 1 },
  high: { label: "高", order: 2 },
  xhigh: { label: "极高", order: 3 },
  max: { label: "最高", order: 4 },
  ultra: { label: "Ultra", order: 5 }
});

const MODEL_INFO = Object.freeze({
  "gpt-5.6-sol": { label: "GPT-5.6 Sol", shortLabel: "5.6 Sol", order: 0 },
  "gpt-5.6-terra": { label: "GPT-5.6 Terra", shortLabel: "5.6 Terra", order: 1 },
  "gpt-5.6-luna": { label: "GPT-5.6 Luna", shortLabel: "5.6 Luna", order: 2 },
  "gpt-5.5": { label: "GPT-5.5", shortLabel: "5.5", order: 3 }
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? Math.round(number) : null;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function olderTimestamp(...values) {
  const timestamps = values
    .map(normalizeTimestamp)
    .filter(Boolean)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return timestamps[0] ?? null;
}

function normalizePoint(point) {
  if (!point || typeof point !== "object") return null;
  const model = typeof point.model === "string" ? point.model.trim().toLowerCase() : "";
  const effort = typeof point.effort === "string" ? point.effort.trim().toLowerCase() : "";
  const iq = finiteNumber(point.iq);

  if (!model || !EFFORT_INFO[effort] || iq == null || iq < 0 || iq > 150) return null;

  return {
    model,
    effort,
    iq,
    samples: nonNegativeInteger(point.total ?? point.valid_tasks) ?? 0,
    runs24h: nonNegativeInteger(point.runs_24h) ?? 0,
    updatedAt: normalizeTimestamp(point.source_updated_at ?? point.latest_graded_at)
  };
}

function parsePayload(payload, label) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.points)) {
    throw new Error(`${label} 数据格式无效：缺少 points 数组。`);
  }

  const points = payload.points.map(normalizePoint).filter(Boolean);
  if (!points.length) throw new Error(`${label} 数据中没有可用的模型档位。`);

  return {
    points,
    sourceUpdatedAt: normalizeTimestamp(payload.source_updated_at)
  };
}

function modelPresentation(model) {
  const known = MODEL_INFO[model];
  if (known) return known;

  const fallback = model
    .replace(/^gpt-/, "GPT-")
    .replace(/(^|[-_])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  return { label: fallback, shortLabel: fallback, order: 999 };
}

function cachePriority(status) {
  if (/ERROR|STALE/i.test(status)) return 3;
  if (/COOLDOWN/i.test(status)) return 2;
  if (/HIT|MISS|BYPASS|REVALIDATED/i.test(status)) return 1;
  return 0;
}

function refreshState(statuses) {
  const worst = [...statuses].sort((a, b) => cachePriority(b) - cachePriority(a))[0] ?? "UNKNOWN";
  if (/ERROR|STALE/i.test(worst)) return "stale";
  if (/COOLDOWN/i.test(worst)) return "cooldown";
  return "current";
}

export function buildSnapshot(softwareSource, visualSource, metadata = {}) {
  const visualByKey = new Map(
    visualSource.points.map((point) => [`${point.model}|${point.effort}`, point])
  );

  const models = new Map();
  for (const softwarePoint of softwareSource.points) {
    const visualPoint = visualByKey.get(`${softwarePoint.model}|${softwarePoint.effort}`);
    if (!visualPoint) continue;

    const presentation = modelPresentation(softwarePoint.model);
    const model = models.get(softwarePoint.model) ?? {
      id: softwarePoint.model,
      label: presentation.label,
      shortLabel: presentation.shortLabel,
      order: presentation.order,
      efforts: []
    };

    model.efforts.push({
      id: softwarePoint.effort,
      label: EFFORT_INFO[softwarePoint.effort].label,
      order: EFFORT_INFO[softwarePoint.effort].order,
      comprehensiveIq: Math.round((softwarePoint.iq + visualPoint.iq) / 2),
      softwareIq: Math.round(softwarePoint.iq),
      softwareSamples: softwarePoint.samples,
      visualSamples: visualPoint.samples,
      runs24h: softwarePoint.runs24h + visualPoint.runs24h,
      updatedAt: olderTimestamp(
        softwarePoint.updatedAt,
        visualPoint.updatedAt,
        softwareSource.sourceUpdatedAt,
        visualSource.sourceUpdatedAt
      )
    });

    models.set(softwarePoint.model, model);
  }

  const modelList = [...models.values()]
    .map((model) => ({
      ...model,
      efforts: model.efforts.sort((left, right) => left.order - right.order)
    }))
    .filter((model) => model.efforts.length)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));

  if (!modelList.length) {
    throw new Error("软件工程与视觉空间数据之间没有可匹配的模型档位。");
  }

  const cacheStatuses = [metadata.softwareCache ?? "UNKNOWN", metadata.visualCache ?? "UNKNOWN"];
  return {
    schemaVersion: 1,
    selectedModel: modelList[0].id,
    models: modelList.map(({ order, ...model }) => ({
      ...model,
      efforts: model.efforts.map(({ order: effortOrder, ...effort }) => effort)
    })),
    source: {
      name: "CodexRadar",
      url: DEFAULT_BASE_URL,
      checkedAt: metadata.checkedAt ?? new Date().toISOString(),
      dataUpdatedAt: olderTimestamp(softwareSource.sourceUpdatedAt, visualSource.sourceUpdatedAt),
      softwareCache: cacheStatuses[0],
      visualCache: cacheStatuses[1],
      refreshState: refreshState(cacheStatuses),
      forceRequested: Boolean(metadata.forceRequested),
      memoryCache: Boolean(metadata.memoryCache)
    },
    warnings: Array.isArray(metadata.warnings) ? metadata.warnings : []
  };
}

function normalizeCacheHeader(value) {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "UNKNOWN";
}

export class RadarClient {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = 30_000,
    memoryTtlMs = 60_000,
    clock = () => Date.now()
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("需要可用的 fetch 实现。");
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.memoryTtlMs = memoryTtlMs;
    this.clock = clock;
    this.lastSuccess = null;
  }

  async #fetchSource(path, label, force) {
    const url = new URL(path, this.baseUrl);
    if (force) url.searchParams.set("refresh", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        cache: force ? "reload" : "default",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${label} 请求失败（HTTP ${response.status}）。`);

      const payload = await response.json();
      return {
        ...parsePayload(payload, label),
        cacheStatus: normalizeCacheHeader(response.headers?.get?.("X-Codex-Cache"))
      };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`${label} 请求超时。`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getSnapshot({ force = false } = {}) {
    const now = this.clock();
    if (!force && this.lastSuccess && now - this.lastSuccess.savedAt < this.memoryTtlMs) {
      return {
        ...this.lastSuccess.snapshot,
        source: {
          ...this.lastSuccess.snapshot.source,
          checkedAt: new Date(now).toISOString(),
          memoryCache: true,
          forceRequested: false
        }
      };
    }

    try {
      const [software, visual] = await Promise.all([
        this.#fetchSource(SOFTWARE_PATH, "软件工程能力", force),
        this.#fetchSource(VISUAL_PATH, "视觉空间能力", force)
      ]);
      const snapshot = buildSnapshot(software, visual, {
        checkedAt: new Date(now).toISOString(),
        forceRequested: force,
        softwareCache: software.cacheStatus,
        visualCache: visual.cacheStatus
      });
      this.lastSuccess = { savedAt: now, snapshot };
      return snapshot;
    } catch (error) {
      if (!this.lastSuccess) throw error;
      return {
        ...this.lastSuccess.snapshot,
        source: {
          ...this.lastSuccess.snapshot.source,
          checkedAt: new Date(now).toISOString(),
          refreshState: "stale",
          forceRequested: force,
          memoryCache: true
        },
        warnings: [`刷新失败，正在显示最近一次成功数据：${error.message}`]
      };
    }
  }
}

export function selectModel(snapshot, requestedModel) {
  const requested = typeof requestedModel === "string" ? requestedModel.trim().toLowerCase() : "";
  const selected = snapshot.models.some((model) => model.id === requested)
    ? requested
    : snapshot.selectedModel;
  return { ...snapshot, selectedModel: selected };
}

export function summarizeSnapshot(snapshot) {
  const model = snapshot.models.find((item) => item.id === snapshot.selectedModel) ?? snapshot.models[0];
  const rows = model.efforts.map(
    (effort) => `${effort.label}：综合 ${effort.comprehensiveIq}，软件工程 ${effort.softwareIq}`
  );
  return [
    `${model.label} 智力效率值：`,
    ...rows,
    `数据源：${snapshot.source.name}；数据时间：${snapshot.source.dataUpdatedAt ?? "未知"}。`
  ].join("\n");
}
