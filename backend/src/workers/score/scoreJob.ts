import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { scoreRecord } from "./scoreRecord.js";

export async function scoreJob(jobId: string) {
  const rows = await prisma.leadershipVerificationResult.findMany({
    where: { jobId },
  });

  for (const v of rows) {
    const confidenceLevel = scoreRecord({
      currentStatus: v.currentStatus,
      dataSources: v.dataSources,
      evidenceDate: v.evidenceDate,
      emailType: v.emailType,
    });

    const costPerRecordUsd = new Prisma.Decimal(v.costUsd).plus(
      new Prisma.Decimal(v.emailCostUsd),
    );

    await prisma.leadershipVerificationResult.update({
      where: { id: v.id },
      data: { confidenceLevel, costPerRecordUsd },
    });
  }

  return { updated: rows.length };
}
