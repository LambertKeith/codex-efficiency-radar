import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRadarServer } from "../src/mcp-server.mjs";

const server = createRadarServer();
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error("Codex Efficiency Radar MCP 启动失败：", error);
  process.exitCode = 1;
}
