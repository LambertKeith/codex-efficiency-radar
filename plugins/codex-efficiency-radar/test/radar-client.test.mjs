import assert from "node:assert/strict";
import test from "node:test";

import { RadarClient, buildSnapshot, selectModel } from "../src/radar-client.mjs";
import { response, softwarePayload, visualPayload } from "./fixtures.mjs";

test("buildSnapshot 按网页口径计算综合智能并排序档位", () => {
  const software = {
    sourceUpdatedAt: softwarePayload.source_updated_at,
    points: softwarePayload.points.slice(0, 3).map((point) => ({
      model: point.model,
      effort: point.effort,
      iq: point.iq,
      samples: point.total,
      runs24h: point.runs_24h,
      updatedAt: null
    }))
  };
  const visual = {
    sourceUpdatedAt: visualPayload.source_updated_at,
    points: visualPayload.points.map((point) => ({
      model: point.model,
      effort: point.effort,
      iq: point.iq,
      samples: point.valid_tasks,
      runs24h: point.runs_24h,
      updatedAt: null
    }))
  };

  const snapshot = buildSnapshot(software, visual, {
    softwareCache: "HIT",
    visualCache: "COOLDOWN",
    checkedAt: "2026-08-31T05:00:00.000Z"
  });

  assert.equal(snapshot.models[0].id, "gpt-5.6-sol");
  assert.deepEqual(snapshot.models[0].efforts.map((item) => item.id), ["low", "medium"]);
  assert.equal(snapshot.models[0].efforts[0].comprehensiveIq, 85);
  assert.equal(snapshot.models[0].efforts[0].softwareIq, 82);
  assert.equal(snapshot.source.refreshState, "cooldown");
});

test("RadarClient 并行取数、传递强制刷新参数并使用内存缓存", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    return String(url).includes("visual-spatial")
      ? response(visualPayload)
      : response(softwarePayload);
  };
  const client = new RadarClient({ fetchImpl, clock: () => Date.parse("2026-08-31T05:00:00.000Z") });

  const first = await client.getSnapshot({ force: true });
  const second = await client.getSnapshot({ force: false });

  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.endsWith("?refresh=1")));
  assert.equal(first.models.length, 2);
  assert.equal(second.source.memoryCache, true);
});

test("刷新失败时返回最近一次成功快照并明确警告", async () => {
  let failing = false;
  const fetchImpl = async (url) => {
    if (failing) throw new Error("网络中断");
    return String(url).includes("visual-spatial")
      ? response(visualPayload)
      : response(softwarePayload);
  };
  let now = Date.parse("2026-08-31T05:00:00.000Z");
  const client = new RadarClient({ fetchImpl, clock: () => now });

  await client.getSnapshot();
  failing = true;
  now += 120_000;
  const fallback = await client.getSnapshot({ force: true });

  assert.equal(fallback.source.refreshState, "stale");
  assert.equal(fallback.source.memoryCache, true);
  assert.match(fallback.warnings[0], /刷新失败/);
});

test("selectModel 对未知模型安全回退", () => {
  const snapshot = { selectedModel: "a", models: [{ id: "a" }, { id: "b" }] };
  assert.equal(selectModel(snapshot, "b").selectedModel, "b");
  assert.equal(selectModel(snapshot, "missing").selectedModel, "a");
});
