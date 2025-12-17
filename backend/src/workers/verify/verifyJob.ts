import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { verifyRecord } from "./verifyRecord.js";
import { scoreJob } from "../score/scoreJob.js";

export async function verifyJob(jobId: string) {
  const records = await prisma.leadershipInputRecord.findMany({
    where: { jobId },
    orderBy: { rowIndex: "asc" },
  });
  let totalCost = 0;

  for (const rec of records) {
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
      },
    });
  }

  await scoreJob(jobId);
  return { recordCount: records.length, totalCostUsd: totalCost };
}
