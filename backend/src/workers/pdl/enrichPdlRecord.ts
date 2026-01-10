import type { LeadershipInputRecord } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { config } from "../../config.js";
import {
  pdlEnrichPerson,
  type PDLPersonEnrichmentResponse,
} from "../../services/pdl/pdlClient.js";
import { normalizeNameForSearch } from "../../utils/normalizePerson.js";

type EnrichmentResult = {
  pdlEmail: string | null;
  pdlPhone: string | null;
  pdlLinkedin: string | null;
  pdlJobTitle: string | null;
  pdlSeniority: string | null;
  pdlOrganization: string | null;
  pdlConfidenceScore: number | null;
  pdlRawResponse: Prisma.InputJsonValue | null;
  pdlCostUsd: number;
  pdlEnrichedAt: string | null;
};

function constructLinkedInProfileFromName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  if (!firstName || !lastName) return null;

  const normalized = `${firstName}${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return `linkedin.com/in/${normalized}`;
}

function extractWorkEmail(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data) return null;

  if (data.work_email) return data.work_email;

  if (data.emails && Array.isArray(data.emails)) {
    const workEmail = data.emails.find(
      (e) => e.type === "work" || e.type === "professional",
    );
    if (workEmail?.address) return workEmail.address;
  }

  return null;
}

function extractPrimaryPhone(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data) return null;

  if (data.mobile_phone) return data.mobile_phone;

  if (
    data.phone_numbers &&
    Array.isArray(data.phone_numbers) &&
    data.phone_numbers.length > 0
  ) {
    return data.phone_numbers[0];
  }

  return null;
}

function extractLinkedInUrl(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data) return null;

  if (data.linkedin_url) return data.linkedin_url;

  if (data.profiles && Array.isArray(data.profiles)) {
    const linkedin = data.profiles.find(
      (p) => p.network?.toLowerCase() === "linkedin",
    );
    if (linkedin?.url) return linkedin.url;
  }

  return null;
}

function extractJobTitle(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data) return null;

  if (data.job_title) return data.job_title;

  if (data.experience && Array.isArray(data.experience)) {
    const primaryJob =
      data.experience.find((exp) => exp.is_primary) || data.experience[0];
    if (primaryJob?.title?.name) return primaryJob.title.name;
  }

  return null;
}

function extractSeniority(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data?.experience || !Array.isArray(data.experience)) return null;

  const primaryJob =
    data.experience.find((exp) => exp.is_primary) || data.experience[0];
  if (primaryJob?.title?.levels && primaryJob.title.levels.length > 0) {
    return primaryJob.title.levels[0];
  }

  return null;
}

function extractOrganization(
  data: PDLPersonEnrichmentResponse["data"],
): string | null {
  if (!data) return null;

  if (data.job_company_name) return data.job_company_name;

  if (data.experience && Array.isArray(data.experience)) {
    const primaryJob =
      data.experience.find((exp) => exp.is_primary) || data.experience[0];
    if (primaryJob?.company?.name) return primaryJob.company.name;
  }

  return null;
}

function extractConfidenceScore(
  response: PDLPersonEnrichmentResponse,
): number | null {
  if (response.likelihood !== undefined && response.likelihood !== null) {
    return response.likelihood / 10;
  }
  return null;
}

function createEmptyResult(cost: number = 0): EnrichmentResult {
  return {
    pdlEmail: null,
    pdlPhone: null,
    pdlLinkedin: null,
    pdlJobTitle: null,
    pdlSeniority: null,
    pdlOrganization: null,
    pdlConfidenceScore: null,
    pdlRawResponse: null,
    pdlCostUsd: cost,
    pdlEnrichedAt: null,
  };
}

function extractEnrichmentData(
  response: PDLPersonEnrichmentResponse,
): EnrichmentResult {
  const data = response.data;

  if (!data) {
    return {
      ...createEmptyResult(0),
      pdlRawResponse: response as Prisma.InputJsonValue,
    };
  }

  return {
    pdlEmail: extractWorkEmail(data),
    pdlPhone: extractPrimaryPhone(data),
    pdlLinkedin: extractLinkedInUrl(data),
    pdlJobTitle: extractJobTitle(data),
    pdlSeniority: extractSeniority(data),
    pdlOrganization: extractOrganization(data),
    pdlConfidenceScore: extractConfidenceScore(response),
    pdlRawResponse: response as Prisma.InputJsonValue,
    pdlCostUsd: 0,
    pdlEnrichedAt: new Date().toISOString(),
  };
}

export async function enrichPdlRecord(
  rec: LeadershipInputRecord,
): Promise<EnrichmentResult> {
  if (config.ENRICHMENT_MODE !== "online") {
    return createEmptyResult(0);
  }

  const firstName = rec.firstName?.trim() ?? null;
  const lastName = rec.lastName?.trim() ?? null;

  if (!firstName || !lastName) {
    return createEmptyResult(0);
  }

  const normalized = normalizeNameForSearch(`${firstName} ${lastName}`);
  const normalizedFirst = normalized?.first ?? firstName;
  const normalizedLast = normalized?.last ?? lastName;

  const linkedInProfile = constructLinkedInProfileFromName(
    normalizedFirst,
    normalizedLast,
  );
  if (!linkedInProfile) {
    return createEmptyResult(0);
  }

  try {
    const result = await pdlEnrichPerson({
      profile: linkedInProfile,
      firstName: normalizedFirst.toLowerCase(),
      lastName: normalizedLast.toLowerCase(),
      companyDomain: rec?.orgDomain?.toLowerCase() || "",
      companyName: rec?.orgName?.toLowerCase() || "",
    });

    const enrichmentData = extractEnrichmentData(result.response);
    enrichmentData.pdlCostUsd = result.costUsd;

    if (result.statusCode === 404 || !result.response.data) {
      return enrichmentData;
    }

    return enrichmentData;
  } catch (error: any) {
    return {
      ...createEmptyResult(0),
      pdlRawResponse: {
        error: error?.message ?? String(error),
        status: 500,
      } as Prisma.InputJsonValue,
    };
  }
}
