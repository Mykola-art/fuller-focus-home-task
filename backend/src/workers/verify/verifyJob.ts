import { Prisma, VerifyMode, CurrentStatus, JobStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { config } from "../../config.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";
import { verifyRecord } from "./verifyRecord.js";
import { scoreJob } from "../score/scoreJob.js";

export async function verifyJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.RUNNING, processedRows: 0, errorCount: 0 },
  });

  const records = await prisma.leadershipInputRecord.findMany({
    where: { jobId },
    orderBy: { rowIndex: "asc" },
  });

  let totalCost = 0;

  const fallbackMode: VerifyMode =
    config.ENRICHMENT_MODE === "online"
      ? VerifyMode.ONLINE
      : VerifyMode.OFFLINE;

  try {
    await mapWithConcurrency(
      records,
      config.WORKER_CONCURRENCY,
      async (rec) => {
        try {
          const v = await verifyRecord(rec);
          totalCost += v.costUsd;

          await prisma.leadershipVerificationResult.upsert({
            where: { recordId: rec.id },
            update: {
              jobId,
              mode: v.mode,
              currentStatus: v.currentStatus,
              currentTitle: v.currentTitle,
              evidenceDate: v.evidenceDate,
              dataSources: v.dataSources as Prisma.InputJsonValue,
              notes: v.notes,
              lastVerifiedAt: new Date(),
              costUsd: new Prisma.Decimal(v.costUsd),
              unknownReason: v.unknownReason,
            },
            create: {
              recordId: rec.id,
              jobId,
              mode: v.mode,
              currentStatus: v.currentStatus,
              currentTitle: v.currentTitle,
              evidenceDate: v.evidenceDate,
              dataSources: v.dataSources as Prisma.InputJsonValue,
              notes: v.notes,
              lastVerifiedAt: new Date(),
              costUsd: new Prisma.Decimal(v.costUsd),
              unknownReason: v.unknownReason,
            },
          });
        } catch (e: any) {
          await prisma.job.update({
            where: { id: jobId },
            data: { errorCount: { increment: 1 } },
          });

          const msg = String(e?.message ?? e ?? "unknown error").slice(0, 500);

          await prisma.leadershipVerificationResult.upsert({
            where: { recordId: rec.id },
            update: {
              jobId,
              mode: fallbackMode,
              currentStatus: CurrentStatus.UNKNOWN,
              notes: `verify_error: ${msg}`,
              lastVerifiedAt: new Date(),
              costUsd: new Prisma.Decimal(0),
              unknownReason: "rate_limited_or_quota",
            },
            create: {
              recordId: rec.id,
              jobId,
              mode: fallbackMode,
              currentStatus: CurrentStatus.UNKNOWN,
              notes: `verify_error: ${msg}`,
              lastVerifiedAt: new Date(),
              costUsd: new Prisma.Decimal(0),
              unknownReason: "rate_limited_or_quota",
            },
          });
        } finally {
          await prisma.job.update({
            where: { id: jobId },
            data: { processedRows: { increment: 1 } },
          });
        }
      }
    );

    await scoreJob(jobId);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED },
    });

    return { recordCount: records.length, totalCostUsd: totalCost };
  } catch (e) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED },
    });
    throw e;
  }
}
