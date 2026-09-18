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

// Fire-and-forget from the redirect: if analytics is down we lose a click, not the redirect.
// Never throws.
export async function recordClick(code: string): Promise<void> {
  try {
    const res = await fetch(`${config.analyticsUrl}/api/clicks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) console.warn(`analytics rejected click for ${code}: ${res.status}`);
  } catch (err) {
    console.warn(`could not record click for ${code}: ${(err as Error).message}`);
  }
}
