// src/services/newsService.ts
// Fetches real financial headlines from NewsData.io.
// Results are cached in memory and refreshed every 5 minutes.

export interface RealHeadline {
  id: string;
  title: string;
  source: string;
}

const NEWSDATA_URL =
  'https://newsdata.io/api/1/latest?apikey=pub_279fe9a4584f47b9ae21084b806e5b10&q=stock+market&language=en&category=business';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: RealHeadline[] = [];
let cacheTimestamp = 0;

export async function fetchRealHeadlines(): Promise<RealHeadline[]> {
  if (cache.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  try {
    const res = await fetch(NEWSDATA_URL);
    if (!res.ok) throw new Error(`newsdata ${res.status}`);
    const json = await res.json();
    const results: Array<{ title?: string; source_id?: string }> = json.results ?? [];
    cache = results
      .filter((r) => r.title)
      .slice(0, 20)
      .map((r, i) => ({
        id: `real-${i}-${Date.now()}`,
        title: r.title!,
        source: (r.source_id ?? 'NEWS').toUpperCase().slice(0, 12),
      }));
    cacheTimestamp = Date.now();
    return cache;
  } catch {
    // Return stale cache on error rather than crashing
    return cache;
  }
}
