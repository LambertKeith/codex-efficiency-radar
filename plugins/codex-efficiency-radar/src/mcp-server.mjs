import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { RadarClient, selectModel, summarizeSnapshot } from "./radar-client.mjs";
import { loadWidgetHtml } from "./widget-template.mjs";

export const WIDGET_URI = "ui://codex-efficiency-radar/widget-v1.html";
const WIDGET_MIME_TYPE = "text/html;profile=mcp-app";

const modelInput = z.string().trim().min(1).max(80).optional();

async function toolResult(client, { force = false, model } = {}) {
  const snapshot = selectModel(await client.getSnapshot({ force }), model);
  return {
    structuredContent: snapshot,
    content: [{ type: "text", text: summarizeSnapshot(snapshot) }]
  };
}

export function createRadarServer({ client = new RadarClient() } = {}) {
  const server = new McpServer(
    { name: "codex-efficiency-radar", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.registerResource("efficiency-radar-widget", WIDGET_URI, {}, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: WIDGET_MIME_TYPE,
        text: await loadWidgetHtml(),
        _meta: {
          ui: { prefersBorder: false },
          "openai/widgetDescription": "按模型与推理强度展示综合智能和软件工程能力，并支持手动刷新。"
        }
      }
    ]
  }));

  server.registerTool(
    "show_efficiency_radar",
    {
      title: "打开智力效率雷达",
      description: "显示 Codex 模型各推理强度的综合智能与软件工程能力实时数值。",
      inputSchema: { model: modelInput },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "正在读取效率值…",
        "openai/toolInvocation/invoked": "效率雷达已更新"
      }
    },
    async ({ model }) => toolResult(client, { model })
  );

  server.registerTool(
    "refresh_efficiency_values",
    {
      title: "刷新效率值",
      description: "重新核对 CodexRadar 数据并返回各模型、各推理强度的最新效率值。",
      inputSchema: {
        force: z.boolean().optional().default(true),
        model: modelInput
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: {
        ui: { visibility: ["model", "app"] },
        "openai/toolInvocation/invoking": "正在刷新效率值…",
        "openai/toolInvocation/invoked": "效率值已刷新"
      }
    },
    async ({ force, model }) => toolResult(client, { force, model })
  );

  return server;
}
