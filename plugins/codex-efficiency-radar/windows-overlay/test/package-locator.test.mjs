import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWindowsActivationScript,
  findMatchingMainProcess,
  isManagedNodeCommand,
  matchCompatibility,
  parseProcessList
} from "../src/package-locator.mjs";
import {
  circuitBreakerState,
  injectorFailed,
  injectorFailureReason
} from "../src/runtime-policy.mjs";

const installation = {
  platform: "darwin",
  arch: "arm64",
  packageVersion: "1.2.3.4",
  appVersion: "8.9.0",
  executableVersion: "5.6.7",
  bundleIdentifier: "com.openai.codex",
  teamIdentifier: "2DC432GLL2",
  asarSha256: "ABCDEF"
};
const compatibility = {
  targets: [
    {
      platform: "darwin",
      arch: "arm64",
      packageVersion: "1.2.3.4",
      appVersion: "8.9.0",
      executableVersion: "5.6.7",
      bundleIdentifier: "com.openai.codex",
      teamIdentifier: "2DC432GLL2",
      asarSha256: "abcdef",
      selectorContract: "test"
    }
  ]
};
const reviewedCompatibility = JSON.parse(
  readFileSync(new URL("../compatibility.json", import.meta.url), "utf8")
);

test("当前 Windows Codex 构建使用完整身份和哈希精确放行", () => {
  const currentInstallation = {
    platform: "win32",
    arch: "x64",
    appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
    packageVersion: "26.831.2377.0",
    appVersion: "26.831.21537",
    executableVersion: "152.0.7977.64",
    asarSha256: "37E442E444194CEBFF47EB190B2C0CCD99332498A361545BBF823C49CCF11CD3"
  };
  assert.equal(
    matchCompatibility(currentInstallation, reviewedCompatibility)?.selectorContract,
    "data-model-picker-view-v2"
  );
  assert.equal(
    matchCompatibility(
      {
        ...currentInstallation,
        asarSha256: "37E442E444194CEBFF47EB190B2C0CCD99332498A361545BBF823C49CCF11CD2"
      },
      reviewedCompatibility
    ),
    null
  );
});

test("只有完整版本与哈希匹配时允许注入", () => {
  assert.equal(matchCompatibility(installation, compatibility)?.selectorContract, "test");
  assert.equal(matchCompatibility({ ...installation, asarSha256: "0000" }, compatibility), null);
  assert.equal(matchCompatibility({ ...installation, appVersion: "9.0.0" }, compatibility), null);
  assert.equal(matchCompatibility({ ...installation, platform: "win32" }, compatibility), null);
  assert.equal(matchCompatibility({ ...installation, arch: "x64" }, compatibility), null);
  assert.equal(matchCompatibility({ ...installation, teamIdentifier: "OTHER" }, compatibility), null);
});

test("卸载器只识别参数边界完整的受管 Node 命令", () => {
  const scriptPath =
    "/Users/test/Library/Application Support/CodexEfficiencyRadar/windows-overlay/src/resident.mjs";
  assert.equal(
    isManagedNodeCommand(`/opt/node ${scriptPath} --ignore-pid=42`, [scriptPath]),
    true
  );
  assert.equal(
    isManagedNodeCommand(`/usr/bin/less ${scriptPath}`, [scriptPath]),
    false
  );
  assert.equal(
    isManagedNodeCommand(`/opt/node ${scriptPath}.backup`, [scriptPath]),
    false
  );
  assert.equal(
    isManagedNodeCommand(`/opt/node worker.mjs --note ${scriptPath}`, [scriptPath]),
    false
  );
});

test("macOS 进程列表只匹配主程序的精确可执行路径", () => {
  const executablePath = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
  const processes = parseProcessList(`
    41 /Applications/ChatGPT.app/Contents/Frameworks/Codex Helper --type=renderer
    42 ${executablePath}
    43 /usr/bin/node worker.mjs
  `);
  assert.deepEqual(findMatchingMainProcess(processes, executablePath), {
    processId: 42,
    commandLine: executablePath
  });
  assert.equal(findMatchingMainProcess(processes, "/Applications/Codex.app/Contents/MacOS/ChatGPT"), null);
});

test("Windows 兼容目标同时校验 AppUserModelID", () => {
  const windowsInstallation = {
    platform: "win32",
    arch: "x64",
    packageVersion: "1.2.3.4",
    appVersion: "8.9.0",
    executableVersion: "5.6.7",
    appUserModelId: "OpenAI.Codex_test!App",
    asarSha256: "ABCDEF"
  };
  const windowsCompatibility = {
    targets: [{ ...windowsInstallation, asarSha256: "abcdef", selectorContract: "test" }]
  };
  assert.equal(
    matchCompatibility(windowsInstallation, windowsCompatibility)?.selectorContract,
    "test"
  );
  assert.equal(
    matchCompatibility(
      { ...windowsInstallation, appUserModelId: "OpenAI.Codex_other!App" },
      windowsCompatibility
    ),
    null
  );
});

test("Windows 打包应用激活脚本安全传递 AUMID 和调试参数", () => {
  const source = "public static class TestActivator {}";
  const appUserModelId = "OpenAI.Codex_2p2nqsd0c76g0!App";
  const arguments_ = "--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1";
  const script = buildWindowsActivationScript(source, appUserModelId, arguments_);
  assert.match(script, /CodexPackagedAppActivator\]::Activate/);
  assert.doesNotMatch(script, /OpenAI\.Codex_2p2nqsd0c76g0!App/);
  assert.doesNotMatch(script, /remote-debugging-port=9333/);
  assert.match(script, new RegExp(Buffer.from(appUserModelId, "utf16le").toString("base64")));
  assert.match(script, new RegExp(Buffer.from(arguments_, "utf16le").toString("base64")));
});

test("注入器非零退出或信号都会触发安全熔断判定", () => {
  assert.equal(injectorFailed({ code: 0, signal: null, error: null }), false);
  assert.equal(injectorFailed({ code: 1, signal: null, error: null }), true);
  assert.equal(injectorFailed({ code: null, signal: "SIGTERM", error: null }), true);
  assert.equal(injectorFailed({ code: null, signal: null, error: new Error("spawn EPERM") }), true);
  assert.equal(injectorFailureReason({ code: 1 }), "注入器退出码 1");
  assert.equal(injectorFailureReason({ signal: "SIGTERM" }), "注入器被信号 SIGTERM 终止");
});

test("熔断状态记录失败阶段并保持可诊断时间", () => {
  const state = circuitBreakerState(
    "spawn EPERM",
    { phase: "launch" },
    new Date("2026-09-01T00:00:00.000Z")
  );
  assert.deepEqual(state, {
    disabledAt: "2026-09-01T00:00:00.000Z",
    reason: "spawn EPERM",
    phase: "launch"
  });
});
