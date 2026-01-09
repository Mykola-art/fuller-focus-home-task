import type { LeadershipInputRecord } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { config } from "../../config.js";
import { pdlEnrichPerson } from "../../services/pdl/pdlClient.js";
import { normalizeNameForSearch } from "../../utils/normalizePerson.js";

function extractWorkEmail(emails?: Array<{ address?: string; type?: string }>): string | null {
  if (!emails || emails.length === 0) return null;
  const workEmail = emails.find((e) => e.type === "work" || e.type === "work_email");
  if (workEmail?.address) return workEmail.address;
  return emails[0]?.address ?? null;
}

function extractPrimaryPhone(phones?: Array<{ number?: string; type?: string }>): string | null {
  if (!phones || phones.length === 0) return null;
  const workPhone = phones.find((p) => p.type === "work" || p.type === "work_phone");
  if (workPhone?.number) return workPhone.number;
  return phones[0]?.number ?? null;
}

function extractLinkedInUrl(profiles?: Array<{ network?: string; url?: string }>): string | null {
  if (!profiles || profiles.length === 0) return null;
  const linkedin = profiles.find((p) => p.network?.toLowerCase() === "linkedin");
  return linkedin?.url ?? null;
}

export async function enrichPdlRecord(rec: LeadershipInputRecord): Promise<{
  pdlEmail: string | null;
  pdlPhone: string | null;
  pdlLinkedin: string | null;
  pdlJobTitle: string | null;
  pdlSeniority: string | null;
  pdlOrganization: string | null;
  pdlConfidenceScore: number | null;
  pdlRawResponse: Prisma.InputJsonValue | null;
  pdlCostUsd: number;
}> {
  if (config.ENRICHMENT_MODE !== "online") {
    return {
      pdlEmail: null,
      pdlPhone: null,
      pdlLinkedin: null,
      pdlJobTitle: null,
      pdlSeniority: null,
      pdlOrganization: null,
      pdlConfidenceScore: null,
      pdlRawResponse: null,
      pdlCostUsd: 0,
    };
  }

  const firstName = rec.firstName?.trim() ?? null;
  const lastName = rec.lastName?.trim() ?? null;

  if (!firstName || !lastName) {
    return {
      pdlEmail: null,
      pdlPhone: null,
      pdlLinkedin: null,
      pdlJobTitle: null,
      pdlSeniority: null,
      pdlOrganization: null,
      pdlConfidenceScore: null,
      pdlRawResponse: null,
      pdlCostUsd: 0,
    };
  }

  const normalized = normalizeNameForSearch(`${firstName} ${lastName}`);
  const normalizedFirst = normalized.first ?? firstName;
  const normalizedLast = normalized.last ?? lastName;

  const companyDomain = rec.orgDomain?.trim() ?? null;
  const companyName = rec.compOrg?.trim() ?? null;

  try {
    const result = await pdlEnrichPerson({
      firstName: normalizedFirst,
      lastName: normalizedLast,
      companyDomain: companyDomain ?? undefined,
      companyName: companyName ?? undefined,
    });

    const response = result.response;
    const costUsd = result.costUsd;

    if (!response.person) {
      return {
        pdlEmail: null,
        pdlPhone: null,
        pdlLinkedin: null,
        pdlJobTitle: null,
        pdlSeniority: null,
        pdlOrganization: null,
        pdlConfidenceScore: null,
        pdlRawResponse: response as Prisma.InputJsonValue,
        pdlCostUsd: costUsd,
      };
    }

    const person = response.person;
    const confidenceScore = person.confidence ?? null;

    return {
      pdlEmail: extractWorkEmail(person.emails),
      pdlPhone: extractPrimaryPhone(person.phone_numbers),
      pdlLinkedin: extractLinkedInUrl(person.profiles),
      pdlJobTitle: person.job_title ?? null,
      pdlSeniority: person.seniority ?? null,
      pdlOrganization: person.company?.name ?? null,
      pdlConfidenceScore: confidenceScore,
      pdlRawResponse: response as Prisma.InputJsonValue,
      pdlCostUsd: costUsd,
    };
  } catch (error: any) {
    return {
      pdlEmail: null,
      pdlPhone: null,
      pdlLinkedin: null,
      pdlJobTitle: null,
      pdlSeniority: null,
      pdlOrganization: null,
      pdlConfidenceScore: null,
      pdlRawResponse: { error: error?.message ?? String(error) } as Prisma.InputJsonValue,
      pdlCostUsd: 0,
    };
  }
}
