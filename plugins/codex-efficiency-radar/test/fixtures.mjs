export const softwarePayload = {
  source_updated_at: "2026-08-31T04:05:33.000Z",
  points: [
    { model: "gpt-5.6-sol", effort: "low", iq: 81.7, total: 336, runs_24h: 9 },
    { model: "gpt-5.6-sol", effort: "medium", iq: 94.2, total: 336, runs_24h: 21 },
    { model: "gpt-5.6-terra", effort: "low", iq: 50.1, total: 336, runs_24h: 19 },
    { model: "unsupported", effort: "off", iq: 22, total: 1, runs_24h: 0 }
  ]
};

export const visualPayload = {
  source_updated_at: "2026-08-31T04:05:34.000Z",
  points: [
    { model: "gpt-5.6-sol", effort: "low", iq: 89.03, valid_tasks: 86, runs_24h: 22 },
    { model: "gpt-5.6-sol", effort: "medium", iq: 92.91, valid_tasks: 86, runs_24h: 17 },
    { model: "gpt-5.6-terra", effort: "low", iq: 70.4, valid_tasks: 86, runs_24h: 11 }
  ]
};

export function response(payload, cache = "HIT") {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Codex-Cache": cache
    }
  });
}
