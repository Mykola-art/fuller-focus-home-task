import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { enrichEmailRecord } from "./enrichEmailRecord.js";
import { config } from "../../config.js";
import { scoreJob } from "../score/scoreJob.js";

export async function enrichEmailsForJob(jobId: string) {
  const records = await prisma.leadershipInputRecord.findMany({
    where: { jobId },
    orderBy: { rowIndex: "asc" },
  });
  let totalCost = 0;

  for (const rec of records) {
    const e = await enrichEmailRecord(rec);
    totalCost += e.emailCostUsd;

    await prisma.leadershipVerificationResult.upsert({
      where: { recordId: rec.id },
      update: {
        verifiedEmail: e.verifiedEmail,
        emailType: e.emailType,
        emailChecks: e.checks as Prisma.InputJsonValue,
        emailSources: e.sources as Prisma.InputJsonValue,
        emailLastCheckedAt: new Date(),
        emailCostUsd: new Prisma.Decimal(e.emailCostUsd),
      },
      create: {
        recordId: rec.id,
        jobId,
        mode: config.ENRICHMENT_MODE === "online" ? "ONLINE" : "OFFLINE",
        currentStatus: "UNKNOWN",
        verifiedEmail: e.verifiedEmail,
        emailType: e.emailType,
        emailChecks: e.checks as Prisma.InputJsonValue,
        emailSources: e.sources as Prisma.InputJsonValue,
        emailLastCheckedAt: new Date(),
        emailCostUsd: new Prisma.Decimal(e.emailCostUsd),
      },
    });
  }

  await scoreJob(jobId);
  return { recordCount: records.length, totalCostUsd: totalCost };
}
