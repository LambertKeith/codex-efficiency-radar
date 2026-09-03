import net from "node:net";

export const RESIDENT_HEALTH_HOST = "127.0.0.1";
export const RESIDENT_HEALTH_PORT = 19333;
export const HEALTHY_RESIDENT_STATES = new Set(["active"]);

export function createResidentHealth({
  status,
  version,
  platform,
  target = null,
  disabled = false,
  uiVerified = false,
  valuesLoaded = false,
  evidence = null,
  pid = process.pid
}) {
  return {
    status,
    version,
    platform,
    target,
    pid,
    disabled,
    uiVerified,
    valuesLoaded,
    evidence
  };
}

export async function listenForResidentHealth(
  getSnapshot,
  { host = RESIDENT_HEALTH_HOST, port = RESIDENT_HEALTH_PORT } = {}
) {
  const server = net.createServer((socket) => {
    socket.end(`${JSON.stringify(getSnapshot())}\n`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

export async function fetchResidentHealth({
  host = RESIDENT_HEALTH_HOST,
  port = RESIDENT_HEALTH_PORT,
  timeoutMs = 1000
} = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let payload = "";

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback(value);
    };

    socket.setTimeout(timeoutMs, () =>
      finish(reject, new Error("Resident 健康检查超时"))
    );
    socket.on("data", (chunk) => {
      payload += chunk.toString("utf8");
      if (payload.length > 8192) {
        finish(reject, new Error("Resident 健康响应过大"));
      }
    });
    socket.on("end", () => {
      try {
        finish(resolve, JSON.parse(payload.trim()));
      } catch (error) {
        finish(reject, new Error(`Resident 健康响应无效：${error.message}`));
      }
    });
    socket.on("error", (error) => finish(reject, error));
  });
}

export function assertFullUiVerificationHistory(evidence, minimum = 1) {
  const history = evidence?.fullUiVerificationHistory;
  if (!Array.isArray(history) || history.length < minimum) {
    throw new Error(`真实模型选择器完整验证不足 ${minimum} 次`);
  }
  const ids = new Set();
  const timestamps = new Set();
  for (const item of history) {
    const verifiedAt = Date.parse(item?.verifiedAt ?? "");
    if (
      typeof item?.verificationId !== "string" ||
      item.verificationId.length === 0 ||
      !Number.isFinite(verifiedAt)
    ) {
      throw new Error("真实模型选择器完整验证历史无效");
    }
    ids.add(item.verificationId);
    timestamps.add(item.verifiedAt);
  }
  if (ids.size < minimum || timestamps.size < minimum) {
    throw new Error(`真实模型选择器完整验证不足 ${minimum} 次不同证据`);
  }
  const latest = history.at(-1)?.verifiedAt;
  if (latest !== evidence.fullUiVerifiedAt) {
    throw new Error("最新完整 UI 验证时间与验证历史不一致");
  }
  return history;
}

export function assertResidentHealth(snapshot, { version, platform, attemptId, maxAgeMs }) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Resident 未返回健康状态");
  }
  if (!HEALTHY_RESIDENT_STATES.has(snapshot.status)) {
    throw new Error(`Resident 尚未完成端到端激活：${snapshot.status ?? "unknown"}`);
  }
  if (snapshot.disabled !== false) {
    throw new Error("Resident 已进入安全熔断状态");
  }
  if (snapshot.version !== version) {
    throw new Error(`Resident 版本不一致：期望 ${version}，实际 ${snapshot.version}`);
  }
  if (snapshot.platform !== platform) {
    throw new Error(`Resident 平台不一致：期望 ${platform}，实际 ${snapshot.platform}`);
  }
  if (typeof snapshot.target !== "string" || snapshot.target.length === 0) {
    throw new Error("Resident 未报告已审核的兼容目标");
  }
  if (!Number.isInteger(snapshot.pid) || snapshot.pid <= 0) {
    throw new Error("Resident 未报告有效进程 ID");
  }
  if (snapshot.uiVerified !== true) {
    throw new Error("真实模型选择器尚未通过界面验证");
  }
  if (snapshot.valuesLoaded !== true) {
    throw new Error("效率数值尚未载入模型选择器");
  }
  if (
    (attemptId && snapshot.evidence?.attemptId !== attemptId) ||
    snapshot.evidence?.entryLabel !== "效率" ||
    !Number.isInteger(snapshot.evidence?.optionCount) ||
    snapshot.evidence.optionCount <= 0 ||
    !Number.isInteger(snapshot.evidence?.numericScoreCount) ||
    snapshot.evidence.numericScoreCount < 2 ||
    snapshot.evidence.valuesMatchSnapshot !== true ||
    snapshot.evidence.numericScoreCount !== snapshot.evidence.expectedValueCount
  ) {
    throw new Error("Resident 未提供有效的模型选择器端到端证据");
  }
  assertFullUiVerificationHistory(snapshot.evidence);
  const heartbeatAt = Date.parse(snapshot.evidence.heartbeatAt ?? "");
  if (!Number.isFinite(heartbeatAt)) {
    throw new Error("选择器增强未提供有效心跳时间");
  }
  if (maxAgeMs && Date.now() - heartbeatAt > maxAgeMs) {
    throw new Error("选择器增强心跳已经过期");
  }
  return snapshot;
}
