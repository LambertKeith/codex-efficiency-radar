import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFullUiVerificationHistory,
  assertResidentHealth,
  createResidentHealth,
  fetchResidentHealth,
  listenForResidentHealth
} from "../src/resident-health.mjs";

function verifiedEvidence(overrides = {}) {
  const fullUiVerifiedAt = new Date().toISOString();
  return {
    entryLabel: "效率",
    modelCount: 3,
    optionCount: 8,
    numericScoreCount: 16,
    expectedValueCount: 16,
    valuesMatchSnapshot: true,
    fullUiVerifiedAt,
    fullUiVerificationHistory: [{
      verificationId: "full-ui-1",
      verifiedAt: fullUiVerifiedAt
    }],
    heartbeatAt: new Date().toISOString(),
    ...overrides
  };
}

test("Resident 健康端点返回可验证的完整安装状态", async () => {
  const snapshot = createResidentHealth({
    status: "active",
    version: "0.5.0",
    platform: "darwin",
    target: "7579/26.831.21537/data-model-picker-view-v2",
    pid: 42,
    disabled: false,
    uiVerified: true,
    valuesLoaded: true,
    evidence: verifiedEvidence()
  });
  const server = await listenForResidentHealth(() => snapshot, { port: 0 });

  try {
    const actual = await fetchResidentHealth({ port: server.address().port });
    assert.deepEqual(
      assertResidentHealth(actual, { version: "0.5.0", platform: "darwin" }),
      snapshot
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Resident 版本、平台、熔断或状态异常时拒绝安装成功", () => {
  const healthy = createResidentHealth({
    status: "active",
    version: "0.5.0",
    platform: "win32",
    target: "26.831.2377.0/26.831.21537/data-model-picker-view-v2",
    pid: 42,
    disabled: false,
    uiVerified: true,
    valuesLoaded: true,
    evidence: verifiedEvidence()
  });

  assert.throws(
    () => assertResidentHealth({ ...healthy, version: "0.4.2" }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /版本不一致/
  );
  assert.throws(
    () => assertResidentHealth({ ...healthy, disabled: true }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /安全熔断/
  );
  assert.throws(
    () => assertResidentHealth({ ...healthy, status: "starting" }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /尚未完成端到端激活/
  );
  assert.throws(
    () => assertResidentHealth({ ...healthy, status: "armed" }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /尚未完成端到端激活/
  );
  assert.throws(
    () => assertResidentHealth({ ...healthy, uiVerified: false }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /尚未通过界面验证/
  );
  assert.throws(
    () => assertResidentHealth({ ...healthy, valuesLoaded: false }, {
      version: "0.5.0",
      platform: "win32"
    }),
    /数值尚未载入/
  );
});

test("安装验收要求两条时间和 ID 均不同的完整 UI 证据", () => {
  const first = "2026-09-03T00:00:00.000Z";
  const second = "2026-09-03T00:00:01.000Z";
  const evidence = verifiedEvidence({
    fullUiVerifiedAt: second,
    fullUiVerificationHistory: [
      { verificationId: "full-ui-1", verifiedAt: first },
      { verificationId: "full-ui-2", verifiedAt: second }
    ]
  });
  assert.equal(assertFullUiVerificationHistory(evidence, 2).length, 2);
  assert.throws(
    () => assertFullUiVerificationHistory({
      ...evidence,
      fullUiVerificationHistory: [
        { verificationId: "same", verifiedAt: first },
        { verificationId: "same", verifiedAt: second }
      ]
    }, 2),
    /不同证据/
  );
});
