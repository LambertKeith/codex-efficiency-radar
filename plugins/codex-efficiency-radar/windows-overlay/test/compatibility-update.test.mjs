import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_COMPATIBILITY_MANIFEST_URL,
  compatibilityCachePath,
  createCompatibilityRefresher,
  fetchCompatibilityDocument,
  isTrustedCompatibilityManifestUrl,
  loadCompatibilityDocument,
  mergeCompatibilityDocuments,
  validateCompatibilityDocument
} from "../src/compatibility-update.mjs";
import { matchCompatibility } from "../src/package-locator.mjs";

const oldWindowsTarget = {
  platform: "win32",
  appUserModelId: "OpenAI.Codex_2p2nqsd0c76g0!App",
  packageVersion: "1.0.0.0",
  appVersion: "1.0.0",
  executableVersion: "150.0.0.0",
  asarSha256: "A".repeat(64),
  selectorContract: "data-codex-intelligence-trigger-v1"
};

const newWindowsTarget = {
  ...oldWindowsTarget,
  packageVersion: "2.0.0.0",
  appVersion: "2.0.0",
  executableVersion: "152.0.0.0",
  asarSha256: "B".repeat(64),
  selectorContract: "data-model-picker-view-v2"
};

function documentWith(...targets) {
  return { schemaVersion: 2, targets };
}

async function temporaryProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "cer-compatibility-"));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(
    path.join(root, "compatibility.json"),
    `${JSON.stringify(documentWith(oldWindowsTarget), null, 2)}\n`
  );
  return root;
}

test("远端兼容清单只允许固定的官方 HTTPS 地址", () => {
  assert.equal(isTrustedCompatibilityManifestUrl(DEFAULT_COMPATIBILITY_MANIFEST_URL), true);
  assert.equal(isTrustedCompatibilityManifestUrl(DEFAULT_COMPATIBILITY_MANIFEST_URL.replace("https:", "http:")), false);
  assert.equal(isTrustedCompatibilityManifestUrl("https://example.com/compatibility.json"), false);
  assert.equal(isTrustedCompatibilityManifestUrl(`${DEFAULT_COMPATIBILITY_MANIFEST_URL}?token=1`), false);
});

test("远端清单拒绝未知契约、错误哈希和非官方 macOS 签名", () => {
  assert.throws(
    () => validateCompatibilityDocument(documentWith({
      ...oldWindowsTarget,
      appUserModelId: "OpenAI.Codex_attacker!App"
    })),
    /不是官方 Windows Codex 身份/
  );
  assert.throws(
    () => validateCompatibilityDocument(documentWith({ ...oldWindowsTarget, selectorContract: "auto" })),
    /选择器契约未审核/
  );
  assert.throws(
    () => validateCompatibilityDocument(documentWith({ ...oldWindowsTarget, asarSha256: "1234" })),
    /哈希无效/
  );
  assert.throws(
    () => validateCompatibilityDocument(documentWith({
      platform: "darwin",
      arch: "arm64",
      packageVersion: "1",
      appVersion: "1",
      executableVersion: "1",
      bundleIdentifier: "com.example.fake",
      teamIdentifier: "OTHER",
      asarSha256: "C".repeat(64),
      selectorContract: "data-model-picker-view-v2"
    })),
    /不是官方 macOS Codex 签名/
  );
});

test("缓存清单只增加经校验目标且不会移除内置目标", () => {
  const merged = mergeCompatibilityDocuments(
    documentWith(oldWindowsTarget),
    documentWith(newWindowsTarget)
  );
  assert.equal(merged.targets.length, 2);
  assert.equal(merged.targets.some((target) => target.packageVersion === "1.0.0.0"), true);
  assert.equal(merged.targets.some((target) => target.packageVersion === "2.0.0.0"), true);
});

test("自动刷新写入审核缓存并在离线时继续使用最近成功清单", async () => {
  const projectRoot = await temporaryProject();
  let now = 1000;
  let online = true;
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    if (!online) throw new Error("offline");
    return {
      ok: true,
      status: 200,
      url: DEFAULT_COMPATIBILITY_MANIFEST_URL,
      text: async () => JSON.stringify(documentWith(newWindowsTarget))
    };
  };
  const refresh = createCompatibilityRefresher({
    projectRoot,
    settings: { intervalMs: 5000 },
    fetchImpl,
    now: () => now
  });

  try {
    const updated = await refresh({ force: true });
    assert.equal(updated.status, "updated");
    assert.equal(updated.document.targets.length, 2);
    assert.equal(
      matchCompatibility(
        { ...newWindowsTarget, arch: "x64" },
        documentWith(oldWindowsTarget)
      ),
      null
    );
    assert.equal(
      matchCompatibility(
        { ...newWindowsTarget, arch: "x64" },
        updated.document
      )?.selectorContract,
      "data-model-picker-view-v2"
    );
    assert.equal(requests, 1);
    assert.equal(JSON.parse(await readFile(compatibilityCachePath(projectRoot), "utf8")).targets.length, 1);

    const cooldown = await refresh();
    assert.equal(cooldown.status, "cooldown");
    assert.equal(requests, 1);

    online = false;
    now += 6000;
    const failed = await refresh();
    assert.equal(failed.status, "failed");
    assert.equal(failed.document.targets.length, 2);
    assert.match(failed.error.message, /offline/);
    assert.equal((await loadCompatibilityDocument(projectRoot)).targets.length, 2);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("远端请求拒绝非固定地址和不受信任重定向", async () => {
  await assert.rejects(
    fetchCompatibilityDocument("https://example.com/compatibility.json", {
      fetchImpl: async () => { throw new Error("不应请求"); }
    }),
    /不是固定的官方 GitHub 地址/
  );
  await assert.rejects(
    fetchCompatibilityDocument(DEFAULT_COMPATIBILITY_MANIFEST_URL, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://example.com/redirected.json",
        text: async () => JSON.stringify(documentWith(newWindowsTarget))
      })
    }),
    /不受信任的重定向/
  );
  await assert.rejects(
    fetchCompatibilityDocument(DEFAULT_COMPATIBILITY_MANIFEST_URL, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: DEFAULT_COMPATIBILITY_MANIFEST_URL,
        headers: { get: () => String(513 * 1024) },
        text: async () => "{}"
      })
    }),
    /响应过大/
  );
});
