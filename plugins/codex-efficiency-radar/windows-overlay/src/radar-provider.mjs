import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function createRadarProvider(radarClientPath) {
  await access(radarClientPath);
  const moduleUrl = pathToFileURL(radarClientPath).href;
  const { RadarClient } = await import(moduleUrl);
  if (typeof RadarClient !== "function") {
    throw new Error(`RadarClient 未从 ${radarClientPath} 导出。`);
  }

  const client = new RadarClient();
  return {
    getSnapshot(options) {
      return client.getSnapshot(options);
    }
  };
}
