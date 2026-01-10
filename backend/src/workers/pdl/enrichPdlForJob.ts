import { Prisma, VerifyMode, CurrentStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { enrichPdlRecord } from "./enrichPdlRecord.js";
import { config } from "../../config.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";

function shouldUpdateField(
  currentValue: string | null | undefined,
  newValue: string | null,
  currentPdlConfidence: number | null | undefined,
  newPdlConfidence: number | null,
): boolean {
  if (!newValue) return false;
  if (!currentValue) return true;

  if (!currentPdlConfidence) return true;
  if (!newPdlConfidence) return false;

  return newPdlConfidence > currentPdlConfidence;
}

export async function enrichPdlForJob(
  jobId: string,
  recordIds?: string[],
): Promise<{
  recordCount: number;
  enrichedCount: number;
  totalCostUsd: number;
  errors: number;
}> {
  const where: Prisma.LeadershipInputRecordWhereInput = { jobId };
  if (recordIds && recordIds.length > 0) {
    where.id = { in: recordIds };
  }

  const records = await prisma.leadershipInputRecord.findMany({
    where,
    orderBy: { rowIndex: "asc" },
    include: { verification: true },
  });

  let enrichedCount = 0;
  let totalCost = 0;
  let errors = 0;

  await mapWithConcurrency(records, config.WORKER_CONCURRENCY, async (rec) => {
    try {
      const enrichment = await enrichPdlRecord(rec);
      totalCost += enrichment.pdlCostUsd;

      if (
        !enrichment.pdlRawResponse ||
        (enrichment.pdlRawResponse as any).error
      ) {
        errors += 1;
        return;
      }

      const existing = rec.verification;
      const existingPdlConfidence = existing?.pdlConfidenceScore
        ? Number(existing.pdlConfidenceScore)
        : null;
      const newPdlConfidence = enrichment.pdlConfidenceScore;

      const shouldUpdateEmail = shouldUpdateField(
        existing?.pdlEmail,
        enrichment.pdlEmail,
        existingPdlConfidence,
        newPdlConfidence,
      );
      const shouldUpdatePhone = shouldUpdateField(
        existing?.pdlPhone,
        enrichment.pdlPhone,
        existingPdlConfidence,
        newPdlConfidence,
      );
      const shouldUpdateLinkedin = shouldUpdateField(
        existing?.pdlLinkedin,
        enrichment.pdlLinkedin,
        existingPdlConfidence,
        newPdlConfidence,
      );
      const shouldUpdateJobTitle = shouldUpdateField(
        existing?.pdlJobTitle,
        enrichment.pdlJobTitle,
        existingPdlConfidence,
        newPdlConfidence,
      );
      const shouldUpdateSeniority = shouldUpdateField(
        existing?.pdlSeniority,
        enrichment.pdlSeniority,
        existingPdlConfidence,
        newPdlConfidence,
      );
      const shouldUpdateOrganization = shouldUpdateField(
        existing?.pdlOrganization,
        enrichment.pdlOrganization,
        existingPdlConfidence,
        newPdlConfidence,
      );

      const updateData: Prisma.LeadershipVerificationResultUpdateInput = {
        pdlRawResponse: enrichment.pdlRawResponse as Prisma.InputJsonValue,
        pdlEnrichedAt: new Date(),
      };

      if (shouldUpdateEmail || !existing?.pdlEmail) {
        updateData.pdlEmail = enrichment.pdlEmail;
      }
      if (shouldUpdatePhone || !existing?.pdlPhone) {
        updateData.pdlPhone = enrichment.pdlPhone;
      }
      if (shouldUpdateLinkedin || !existing?.pdlLinkedin) {
        updateData.pdlLinkedin = enrichment.pdlLinkedin;
      }
      if (shouldUpdateJobTitle || !existing?.pdlJobTitle) {
        updateData.pdlJobTitle = enrichment.pdlJobTitle;
      }
      if (shouldUpdateSeniority || !existing?.pdlSeniority) {
        updateData.pdlSeniority = enrichment.pdlSeniority;
      }
      if (shouldUpdateOrganization || !existing?.pdlOrganization) {
        updateData.pdlOrganization = enrichment.pdlOrganization;
      }

      if (enrichment.pdlConfidenceScore !== null) {
        updateData.pdlConfidenceScore = new Prisma.Decimal(
          enrichment.pdlConfidenceScore,
        );
      }

      const createData = {
        recordId: rec.id,
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
          enrichment.pdlConfidenceScore !== null
            ? new Prisma.Decimal(enrichment.pdlConfidenceScore)
            : null,
      };

      await prisma.leadershipVerificationResult.upsert({
        where: { recordId: rec.id },
        update: updateData,
        create: createData,
      });

      if (
        enrichment.pdlEmail ||
        enrichment.pdlPhone ||
        enrichment.pdlLinkedin
      ) {
        enrichedCount += 1;
      }
    } catch (error) {
      errors += 1;
      console.error(`Error enriching record ${rec.id}:`, error);
    }
  });

  return {
    recordCount: records.length,
    enrichedCount,
    totalCostUsd: totalCost,
    errors,
  };
}
