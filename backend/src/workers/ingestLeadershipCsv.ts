import { parse } from "csv-parse/sync";
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

export async function ingestLeadershipCsv(params: {
  jobId: string;
  csvBuffer: Buffer;
}) {
  const rows: Record<string, string>[] = parse(params.csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
  if (!rows.length) throw new Error("CSV has no data rows");

  const required = Object.keys(InputRowSchema.shape);
  const actual = Object.keys(rows[0] ?? {});
  const missing = required.filter((h) => !actual.includes(h));
  if (missing.length)
    throw new Error(`CSV missing required columns: ${missing.join(", ")}`);

  let errorCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: params.jobId },
      data: { status: "RUNNING" },
    });

    for (let i = 0; i < rows.length; i++) {
      const parsed = InputRowSchema.safeParse(rows[i]);
      const issues: string[] = [];
      if (!parsed.success) {
        errorCount++;
        issues.push("row_schema_invalid");
      }
      const r: any = parsed.success ? parsed.data : rows[i];

      const einRaw = String(r.filer_ein ?? "").trim();
      const einDigits = einRaw.replace(/\D/g, "");
      if (einDigits.length !== 9) issues.push("ein_not_9_digits");

      const websiteRaw = r.website ? String(r.website).trim() : "";
      const domain = normalizeWebsiteToDomain(websiteRaw);
      if (!websiteRaw) issues.push("missing_website");
      if (websiteRaw && !domain) issues.push("website_unparseable");

      const nameRaw = String(r.employee_name ?? "").trim();
      const name = parsePersonName(nameRaw);
      if (name?.issues?.length) issues.push(...name.issues);

      await tx.leadershipInputRecord.create({
        data: {
          jobId: params.jobId,
          rowIndex: i + 1,
          filerEin: einDigits || einRaw,
          orgName: String(r.org_name ?? "").trim(),
          websiteRaw: websiteRaw || null,
          orgDomain: domain || null,
          employeeNameRaw: nameRaw,
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
      data: { totalRows: rows.length, processedRows: rows.length, errorCount },
    });
  });

  return { totalRows: rows.length, errorCount };
}
