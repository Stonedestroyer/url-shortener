import { config } from "./config.js";

export interface LinkStats {
  code: string;
  clicks: number;
}

// Timeout so a slow analytics service can't hang the shortener.
export async function getStats(code: string): Promise<LinkStats | null> {
  const res = await fetch(`${config.analyticsUrl}/api/stats/${encodeURIComponent(code)}`, {
    signal: AbortSignal.timeout(2000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`analytics responded ${res.status}`);
  return (await res.json()) as LinkStats;
}

// TODO: recordClick (POST /api/clicks)
export async function recordClick(code: string): Promise<void> {
  throw new Error(`recordClick(${code}) not implemented yet`);
}
