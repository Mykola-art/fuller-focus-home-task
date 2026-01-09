import { CacheProvider } from "@prisma/client";
import { config } from "../../config.js";
import { buildCacheKey, getCache, setCache } from "../cache/cache.js";
import { fetchWithRetry } from "../http/fetchWithRetry.js";
import { limiters } from "../rateLimit/limiters.js";

export type PDLPersonEnrichmentResponse = {
  status?: number;
  person?: {
    id?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    emails?: Array<{
      address?: string;
      type?: string;
    }>;
    phone_numbers?: Array<{
      number?: string;
      type?: string;
    }>;
    profiles?: Array<{
      network?: string;
      url?: string;
    }>;
    job_title?: string;
    seniority?: string;
    company?: {
      name?: string;
      domain?: string;
    };
    confidence?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

export type PDLEnrichmentParams = {
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
  companyName?: string;
};

export async function pdlEnrichPerson(
  params: PDLEnrichmentParams,
): Promise<{
  response: PDLPersonEnrichmentResponse;
  costUsd: number;
  cached: boolean;
}> {
  const request: Record<string, string> = {};
  if (params.firstName) request.first_name = params.firstName;
  if (params.lastName) request.last_name = params.lastName;
  if (params.companyDomain) request.company_domain = params.companyDomain;
  if (params.companyName) request.company = params.companyName;

  const cacheKey = buildCacheKey(CacheProvider.PDL, request);

  const cached = await getCache<PDLPersonEnrichmentResponse>(
    CacheProvider.PDL,
    cacheKey,
  );
  if (cached.hit)
    return { response: cached.value ?? {}, costUsd: 0, cached: true };

  if (!config.PDL_API_KEY)
    throw new Error("PDL_API_KEY is required for PDL enrichment");

  const url = new URL("https://api.peopledatalabs.com/v5/person/enrich");
  if (params.firstName) url.searchParams.set("first_name", params.firstName);
  if (params.lastName) url.searchParams.set("last_name", params.lastName);
  if (params.companyDomain)
    url.searchParams.set("company_domain", params.companyDomain);
  if (params.companyName) url.searchParams.set("company", params.companyName);

  const res = await limiters.pdl.schedule(() =>
    fetchWithRetry(url.toString(), {
      method: "GET",
      headers: {
        "X-Api-Key": config.PDL_API_KEY,
        Accept: "application/json",
      },
    }),
  );

  if (res.status === 429) {
    const body = await res.text().catch(() => "");
    throw new Error(`PDL 429: ${body}`);
  }

  const json = (await res.json()) as PDLPersonEnrichmentResponse;

  const costUsd =
    res.status === 200 && json.person ? config.PDL_COST_PER_ENRICHMENT_USD : 0;

  await setCache({
    provider: CacheProvider.PDL,
    cacheKey,
    request,
    response: json,
    statusCode: res.status,
    costUsd,
    ttlDays: 90,
  });

  return { response: json, costUsd, cached: false };
}
