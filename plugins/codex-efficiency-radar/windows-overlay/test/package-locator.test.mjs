import assert from "node:assert/strict";
import test from "node:test";

import {
  findMatchingMainProcess,
  isManagedNodeCommand,
  matchCompatibility,
  parseProcessList
} from "../src/package-locator.mjs";

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
