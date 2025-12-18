import { CacheProvider } from "@prisma/client";
import { config } from "../../config.js";
import { buildCacheKey, getCache, setCache } from "../cache/cache.js";
import { fetchWithRetry } from "../http/fetchWithRetry.js";
import { limiters } from "../rateLimit/limiters.js";

export type HunterFinderResponse = {
  data?: {
    email?: string;
    score?: number;
    position?: string;
    sources?: Array<{
      uri?: string;
      extracted_on?: string;
      last_seen_on?: string;
      still_on_page?: boolean;
    }>;
  };
  errors?: any[];
};

export async function hunterFindEmail(params: {
  domain: string;
  firstName: string;
  lastName: string;
}) {
  const request = {
    domain: params.domain,
    first_name: params.firstName,
    last_name: params.lastName,
  };
  const cacheKey = buildCacheKey(CacheProvider.EMAIL_FINDER, request);

  const cached = await getCache<HunterFinderResponse>(
    CacheProvider.EMAIL_FINDER,
    cacheKey,
  );
  if (cached.hit)
    return { response: cached.value ?? {}, costUsd: 0, cached: true };

  if (!config.HUNTER_API_KEY)
    throw new Error(
      "HUNTER_API_KEY is required when EMAIL_FINDER_PROVIDER=hunter",
    );

  const url = new URL("https://api.hunter.io/v2/email-finder");
  url.searchParams.set("domain", params.domain);
  url.searchParams.set("first_name", params.firstName);
  url.searchParams.set("last_name", params.lastName);
  url.searchParams.set("api_key", config.HUNTER_API_KEY);

  const res = await limiters.hunter.schedule(() =>
    fetchWithRetry(url.toString(), { method: "GET" }),
  );

  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    throw new Error(`Hunter 429: ${body}`);
  }

  const json = (await res.json()) as HunterFinderResponse;

  const costUsd = config.HUNTER_COST_PER_LOOKUP_USD;

  await setCache({
    provider: CacheProvider.EMAIL_FINDER,
    cacheKey,
    request,
    response: json,
    statusCode: res.status,
    costUsd,
    ttlDays: 90,
  });

  return { response: json, costUsd, cached: false };
}
