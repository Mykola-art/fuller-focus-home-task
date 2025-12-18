import { CacheProvider } from "@prisma/client";
import { config, requireOnlineConfig } from "../../config.js";
import { buildCacheKey, getCache, setCache } from "../cache/cache.js";
import { fetchWithRetry } from "../http/fetchWithRetry.js";
import { limiters } from "../rateLimit/limiters.js";

export type GoogleCseItem = {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: any;
};
export type GoogleCseResponse = { items?: GoogleCseItem[] };

export async function googleCseSearch(q: string, num = 5) {
  requireOnlineConfig();

  const request = { q, num, cx: config.GOOGLE_CSE_CX };
  const cacheKey = buildCacheKey(CacheProvider.GOOGLE_CSE, request);

  const cached = await getCache<GoogleCseResponse>(
    CacheProvider.GOOGLE_CSE,
    cacheKey,
  );
  if (cached.hit)
    return { response: cached.value ?? {}, costUsd: 0, cached: true };

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", config.GOOGLE_CSE_API_KEY);
  url.searchParams.set("cx", config.GOOGLE_CSE_CX);
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(num));

  const res = await limiters.googleCse.schedule(() =>
    fetchWithRetry(url.toString(), { method: "GET" }),
  );

  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google CSE 429: ${body}`);
  }

  const json = (await res.json()) as GoogleCseResponse;

  const costUsd = config.GOOGLE_CSE_COST_PER_QUERY_USD;

  await setCache({
    provider: CacheProvider.GOOGLE_CSE,
    cacheKey,
    request,
    response: json,
    statusCode: res.status,
    costUsd,
    ttlDays: 30,
  });
  return { response: json, costUsd, cached: false };
}
