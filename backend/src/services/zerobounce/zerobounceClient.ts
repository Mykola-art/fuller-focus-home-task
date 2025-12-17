import { CacheProvider } from "@prisma/client";
import { config } from "../../config.js";
import { buildCacheKey, getCache, setCache } from "../cache/cache.js";

export type ZeroBounceValidateResponse = {
  address?: string;
  status?:
    | "valid"
    | "invalid"
    | "catch-all"
    | "unknown"
    | "spamtrap"
    | "abuse"
    | "do_not_mail";
  sub_status?: string;
  free_email?: boolean;
  domain?: string;
  mx_found?: "true" | "false";
  processed_at?: string;
  error?: string;
};

export async function zerobounceValidate(email: string) {
  const request = { email };
  const cacheKey = buildCacheKey(CacheProvider.EMAIL_VERIFIER, request);

  const cached = await getCache<ZeroBounceValidateResponse>(
    CacheProvider.EMAIL_VERIFIER,
    cacheKey,
  );
  if (cached.hit)
    return { response: cached.value ?? {}, costUsd: 0, cached: true };

  if (!config.ZEROBOUNCE_API_KEY)
    throw new Error(
      "ZEROBOUNCE_API_KEY is required when EMAIL_VERIFIER_PROVIDER=zerobounce",
    );

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", config.ZEROBOUNCE_API_KEY);
  url.searchParams.set("email", email);
  url.searchParams.set("ip_address", "");

  const res = await fetch(url.toString());
  const json = (await res.json()) as ZeroBounceValidateResponse;

  const costUsd = json?.error ? 0 : config.ZEROBOUNCE_COST_PER_VERIFY_USD;

  await setCache({
    provider: CacheProvider.EMAIL_VERIFIER,
    cacheKey,
    request,
    response: json,
    statusCode: res.status,
    costUsd,
    ttlDays: 90,
  });

  return { response: json, costUsd, cached: false };
}
