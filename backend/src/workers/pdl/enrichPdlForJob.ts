import { Prisma, VerifyMode, CurrentStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { enrichPdlRecord } from "./enrichPdlRecord.js";
import { config } from "../../config.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";

type EnrichmentStats = {
  recordCount: number;
  enrichedCount: number;
  totalCostUsd: number;
  errors: number;
};

type EnrichmentResult = Awaited<ReturnType<typeof enrichPdlRecord>>;

function shouldUpdateField(
  currentValue: string | null | undefined,
  newValue: string | null,
  currentConfidence: number | null | undefined,
  newConfidence: number | null,
): boolean {
  if (!newValue) return false;
  if (!currentValue) return true;
  if (!currentConfidence) return true;
  if (!newConfidence) return false;
  return newConfidence > currentConfidence;
}

function hasEnrichmentData(enrichment: EnrichmentResult): boolean {
  return !!(
    enrichment.pdlEmail ||
    enrichment.pdlPhone ||
    enrichment.pdlLinkedin
  );
}

function isErrorResponse(rawResponse: any): boolean {
  if (!rawResponse) return true;
  if (rawResponse.status === 404) return false;
  return !!rawResponse.error;
}

function buildUpdateData(
  enrichment: EnrichmentResult,
  existing: any,
): Prisma.LeadershipVerificationResultUpdateInput {
  const existingConfidence = existing?.pdlConfidenceScore
    ? Number(existing.pdlConfidenceScore)
    : null;
  const newConfidence = enrichment.pdlConfidenceScore;

  const updateData: Prisma.LeadershipVerificationResultUpdateInput = {
    pdlRawResponse: enrichment.pdlRawResponse as Prisma.InputJsonValue,
    pdlEnrichedAt: new Date(),
  };

  const fields = [
    { key: "pdlEmail" as const, value: enrichment.pdlEmail },
    { key: "pdlPhone" as const, value: enrichment.pdlPhone },
    { key: "pdlLinkedin" as const, value: enrichment.pdlLinkedin },
    { key: "pdlJobTitle" as const, value: enrichment.pdlJobTitle },
    { key: "pdlSeniority" as const, value: enrichment.pdlSeniority },
    { key: "pdlOrganization" as const, value: enrichment.pdlOrganization },
  ] as const;

  for (const { key, value } of fields) {
    const shouldUpdate =
      shouldUpdateField(
        existing?.[key],
        value,
        existingConfidence,
        newConfidence,
      ) || !existing?.[key];
    if (shouldUpdate) {
      updateData[key] = value;
    }
  }

  if (enrichment.pdlConfidenceScore !== null) {
    updateData.pdlConfidenceScore = new Prisma.Decimal(
      enrichment.pdlConfidenceScore,
    );
  }

  return updateData;
}

function buildCreateData(
  enrichment: EnrichmentResult,
  recordId: string,
  jobId: string,
): Prisma.LeadershipVerificationResultUncheckedCreateInput {
  return {
    recordId,
    jobId,
    mode: (config.ENRICHMENT_MODE === "online"
      ? "ONLINE"
      : "OFFLINE") as VerifyMode,
    currentStatus: "UNKNOWN" as CurrentStatus,
    pdlRawResponse: enrichment.pdlRawResponse as Prisma.InputJsonValue,
    pdlEnrichedAt: new Date(),
    pdlEmail: enrichment.pdlEmail ?? null,
    pdlPhone: enrichment.pdlPhone ?? null,
    pdlLinkedin: enrichment.pdlLinkedin ?? null,
    pdlJobTitle: enrichment.pdlJobTitle ?? null,
    pdlSeniority: enrichment.pdlSeniority ?? null,
    pdlOrganization: enrichment.pdlOrganization ?? null,
    pdlConfidenceScore:
      enrichment.pdlConfidenceScore === null
        ? null
        : new Prisma.Decimal(enrichment.pdlConfidenceScore),
  };
}

async function processRecord(
  recordId: string,
  jobId: string,
  stats: { enrichedCount: number; totalCost: number; errors: number },
): Promise<void> {
  try {
    const record = await prisma.leadershipInputRecord.findUnique({
      where: { id: recordId },
    });

    if (!record) {
      stats.errors += 1;
      return;
    }

    const enrichment = await enrichPdlRecord(record);
    stats.totalCost += enrichment.pdlCostUsd;

    const rawResponse = enrichment.pdlRawResponse as any;

    if (isErrorResponse(rawResponse)) {
      stats.errors += 1;
      return;
    }

    const existing = await prisma.leadershipVerificationResult.findUnique({
      where: { recordId },
    });

    if (existing) {
      const updateData = buildUpdateData(enrichment, existing);
      await prisma.leadershipVerificationResult.update({
        where: { recordId },
        data: updateData,
      });
    } else {
      const createData = buildCreateData(enrichment, recordId, jobId);
      await prisma.leadershipVerificationResult.create({
        data: createData,
      });
    }

    if (hasEnrichmentData(enrichment)) {
      stats.enrichedCount += 1;
    }
  } catch (error) {
    stats.errors += 1;
    console.error(`Error enriching record ${recordId}:`, error);
  }
}

export async function enrichPdlForJob(
  jobId: string,
  recordIds?: string[],
): Promise<EnrichmentStats> {
  const where: Prisma.LeadershipInputRecordWhereInput = { jobId };
  if (recordIds && recordIds.length > 0) {
    where.id = { in: recordIds };
  }

  const records = await prisma.leadershipInputRecord.findMany({
    where,
    orderBy: { rowIndex: "asc" },
  });

  const stats = {
    enrichedCount: 0,
    totalCost: 0,
    errors: 0,
  };

  await mapWithConcurrency(records, config.WORKER_CONCURRENCY, async (rec) => {
    await processRecord(rec.id, jobId, stats);
  });

  return {
    recordCount: records.length,
    enrichedCount: stats.enrichedCount,
    totalCostUsd: stats.totalCost,
    errors: stats.errors,
  };
}
