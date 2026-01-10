import { CacheProvider } from "@prisma/client";
import { config } from "../../config.js";
import { buildCacheKey, getCache, setCache } from "../cache/cache.js";
import { fetchWithRetry } from "../http/fetchWithRetry.js";
import { limiters } from "../rateLimit/limiters.js";

export type PDLPersonEnrichmentResponse = {
  status?: number;
  likelihood?: number;
  data?: {
    id?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    work_email?: string;
    personal_emails?: string[];
    recommended_personal_email?: string;
    mobile_phone?: string;
    phone_numbers?: string[];
    linkedin_url?: string;
    linkedin_username?: string;
    job_title?: string;
    job_company_name?: string;
    job_company_website?: string;
    emails?: Array<{
      address?: string;
      type?: string;
    }>;
    profiles?: Array<{
      network?: string;
      url?: string;
      username?: string;
    }>;
    experience?: Array<{
      title?: {
        name?: string;
        levels?: string[];
      };
      company?: {
        name?: string;
        website?: string;
      };
      is_primary?: boolean;
    }>;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

export type PDLEnrichmentParams = {
  profile?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
  companyName?: string;
};

export async function pdlEnrichPerson(params: PDLEnrichmentParams): Promise<{
  response: PDLPersonEnrichmentResponse;
  costUsd: number;
  cached: boolean;
  statusCode: number;
}> {
  const request: Record<string, string> = {};
  if (params.profile) request.profile = params.profile;
  if (params.email) request.email = params.email;
  if (params.firstName) request.first_name = params.firstName;
  if (params.lastName) request.last_name = params.lastName;
  if (params.companyDomain) request.company_domain = params.companyDomain;
  if (params.companyName) request.company = params.companyName;

  const cacheKey = buildCacheKey(CacheProvider.PDL, request);

  const cached = await getCache<PDLPersonEnrichmentResponse>(
    CacheProvider.PDL,
    cacheKey,
  );
  if (cached.hit) {
    const cachedResponse = cached.value ?? {};
    return {
      response: cachedResponse,
      costUsd: 0,
      cached: true,
      statusCode: cachedResponse.status ?? 200,
    };
  }

  if (!config.PDL_API_KEY)
    throw new Error("PDL_API_KEY is required for PDL enrichment");

  const url = new URL("https://api.peopledatalabs.com/v5/person/enrich");
  if (params.profile) url.searchParams.set("profile", params.profile);
  if (params.email) url.searchParams.set("email", params.email);
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
    throw new Error(`PDL rate limit exceeded: ${body}`);
  }

  let json: PDLPersonEnrichmentResponse;
  try {
    json = (await res.json()) as PDLPersonEnrichmentResponse;
  } catch (parseError) {
    throw new Error(`PDL API response parse error: ${String(parseError)}`);
  }

  if (res.status === 404) {
    return {
      response: {
        status: res.status,
        error: {
          type: "not_found",
          message: "No records were found matching your request",
        },
      },
      costUsd: 0,
      cached: true,
      statusCode: 404,
    };
  }

  const hasPerson = json.data;
  const costUsd =
    res.status === 200 && hasPerson ? config.PDL_COST_PER_ENRICHMENT_USD : 0;

  await setCache({
    provider: CacheProvider.PDL,
    cacheKey,
    request,
    response: json,
    statusCode: res.status,
    costUsd,
    ttlDays: 90,
  });

  return {
    response: json,
    costUsd,
    cached: false,
    statusCode: json.status ?? res.status,
  };
}
