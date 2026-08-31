import assert from "node:assert/strict";
import test from "node:test";

import { matchCompatibility } from "../src/package-locator.mjs";

const installation = {
  packageVersion: "1.2.3.4",
  appVersion: "8.9.0",
  executableVersion: "5.6.7",
  asarSha256: "ABCDEF"
};
const compatibility = {
  targets: [
    {
      packageVersion: "1.2.3.4",
      appVersion: "8.9.0",
      executableVersion: "5.6.7",
      asarSha256: "abcdef",
      selectorContract: "test"
    }
  ]
};

test("只有完整版本与哈希匹配时允许注入", () => {
  assert.equal(matchCompatibility(installation, compatibility)?.selectorContract, "test");
  assert.equal(matchCompatibility({ ...installation, asarSha256: "0000" }, compatibility), null);
  assert.equal(matchCompatibility({ ...installation, appVersion: "9.0.0" }, compatibility), null);
});
