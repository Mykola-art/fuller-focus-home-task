import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { normalizeWebsiteToDomain } from "./normalizers/normalizeWebsiteToDomain.js";
import { parsePersonName } from "./normalizers/parsePersonName.js";

const InputRowSchema = z.object({
  filer_ein: z.string().min(1),
  org_name: z.string().min(1),
  website: z.string().optional().nullable(),
  employee_name: z.string().min(1),
  employee_title: z.string().optional().nullable(),
  comp_org: z.string().optional().nullable(),
});

export async function ingestLeadershipJson(params: {
  jobId: string;
  jsonData: unknown[];
}) {
  if (!Array.isArray(params.jsonData)) {
    throw new Error("JSON data must be an array");
  }

  if (!params.jsonData.length) {
    throw new Error("JSON array has no data rows");
  }

  const requiredFields = ["filer_ein", "org_name", "employee_name"];
  const firstRow = params.jsonData[0] as Record<string, unknown> | null;
  if (!firstRow) {
    throw new Error("JSON array is empty");
  }

  const actual = Object.keys(firstRow);
  const missing = requiredFields.filter((h) => !actual.includes(h));
  if (missing.length) {
    throw new Error(`JSON missing required fields: ${missing.join(", ")}`);
  }

  let errorCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: params.jobId },
      data: { status: "RUNNING" },
    });

    for (let i = 0; i < params.jsonData.length; i++) {
      const row = params.jsonData[i];
      const parsed = InputRowSchema.safeParse(row);
      const issues: string[] = [];

      if (!parsed.success) {
        errorCount++;
        issues.push("row_schema_invalid");
      }

      const r: any = parsed.success ? parsed.data : row;

      const einRaw = String(r.filer_ein ?? "").trim();
      const einDigits = einRaw.replace(/\D/g, "");
      if (einDigits.length !== 9) {
        issues.push("ein_not_9_digits");
      }

      const websiteRaw = r.website ? String(r.website).trim() : "";
      const normalizedWebsite =
        websiteRaw === "N/A" || websiteRaw.toUpperCase() === "N/A"
          ? ""
          : websiteRaw;
      const domain = normalizeWebsiteToDomain(normalizedWebsite);
      if (!normalizedWebsite) {
        issues.push("missing_website");
      }
      if (normalizedWebsite && !domain) {
        issues.push("website_unparseable");
      }

      const nameRaw = String(r.employee_name ?? "").trim();
      if (!nameRaw) {
        issues.push("missing_employee_name");
        errorCount++;
      }

      const name = nameRaw ? parsePersonName(nameRaw) : null;
      if (name?.issues?.length) {
        issues.push(...name.issues);
      }

      const orgName = String(r.org_name ?? "").trim();
      if (!orgName) {
        issues.push("missing_org_name");
        errorCount++;
      }

      await tx.leadershipInputRecord.create({
        data: {
          jobId: params.jobId,
          rowIndex: i + 1,
          filerEin: einDigits || einRaw,
          orgName: orgName || "Unknown",
          websiteRaw: normalizedWebsite || null,
          orgDomain: domain || null,
          employeeNameRaw: nameRaw || "Unknown",
          employeeTitleRaw: r.employee_title
            ? String(r.employee_title).trim()
            : null,
          compOrg: r.comp_org ? String(r.comp_org).trim() : null,
          firstName: name?.firstName ?? null,
          middleName: name?.middleName ?? null,
          lastName: name?.lastName ?? null,
          suffix: name?.suffix ?? null,
          inputIssues: issues,
        },
      });
    }

    await tx.job.update({
      where: { id: params.jobId },
      data: {
        totalRows: params.jsonData.length,
        processedRows: params.jsonData.length,
        errorCount,
      },
    });
  });

  return { totalRows: params.jsonData.length, errorCount };
}
