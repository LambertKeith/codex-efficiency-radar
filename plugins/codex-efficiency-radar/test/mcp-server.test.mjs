import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createRadarServer, WIDGET_URI } from "../src/mcp-server.mjs";

const snapshot = {
  schemaVersion: 1,
  selectedModel: "gpt-5.6-sol",
  models: [
    {
      id: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      shortLabel: "5.6 Sol",
      efforts: [
        {
          id: "high",
          label: "高",
          comprehensiveIq: 98,
          softwareIq: 97,
          softwareSamples: 336,
          visualSamples: 86,
          runs24h: 36,
          updatedAt: "2026-08-31T04:05:33.000Z"
        }
      ]
    }
  ],
  source: {
    name: "CodexRadar",
    url: "https://codexradar.com",
    checkedAt: "2026-08-31T05:00:00.000Z",
    dataUpdatedAt: "2026-08-31T04:05:33.000Z",
    softwareCache: "HIT",
    visualCache: "HIT",
    refreshState: "current",
    forceRequested: false,
    memoryCache: false
  },
  warnings: []
};

test("MCP 服务器公开展示、刷新工具和组件资源", async (t) => {
  const calls = [];
  const radarClient = {
    async getSnapshot(options) {
      calls.push(options);
      return structuredClone(snapshot);
    }
  };
  const server = createRadarServer({ client: radarClient });
  const client = new Client({ name: "radar-test-client", version: "0.1.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ["refresh_efficiency_values", "show_efficiency_radar"]
  );

  const shown = await client.callTool({ name: "show_efficiency_radar", arguments: {} });
  assert.equal(shown.structuredContent.selectedModel, "gpt-5.6-sol");
  assert.match(shown.content[0].text, /综合 98/);

  await client.callTool({
    name: "refresh_efficiency_values",
    arguments: { force: true, model: "gpt-5.6-sol" }
  });
  assert.deepEqual(calls, [{ force: false }, { force: true }]);

  const resource = await client.readResource({ uri: WIDGET_URI });
  assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(resource.contents[0].text, /刷新效率值/);
});
