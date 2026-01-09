import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Parser } from "@json2csv/plainjs";

import { prisma } from "../db/prisma.js";
import { ingestLeadershipCsv } from "../workers/ingestLeadershipCsv.js";
import { verifyJob } from "../workers/verify/verifyJob.js";
import { enrichEmailsForJob } from "../workers/email/enrichEmailsForJob.js";
import { enrichPdlForJob } from "../workers/pdl/enrichPdlForJob.js";

export const jobsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

jobsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ error: "Missing file (multipart field name: file)" });

  const job = await prisma.job.create({
    data: { originalFile: req.file.originalname, status: "PENDING" },
  });

  //TODO: review the logic of extracting the jobId with the same data file in order to actually use the cache results to reduce costs
  try {
    const ingest = await ingestLeadershipCsv({
      jobId: job.id,
      csvBuffer: req.file.buffer,
    });

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        totalRows: ingest.totalRows,
        processedRows: ingest.totalRows,
        errorCount: ingest.errorCount,
      },
    });

    return res.status(201).json({ job: updated, ingest });
  } catch (e: any) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    return res
      .status(500)
      .json({ error: "Ingestion failed", details: e?.message ?? String(e) });
  }
});

jobsRouter.get("/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const job = await prisma.job.findUnique({ where: { id: id.data } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  return res.json({ job });
});

jobsRouter.get("/:id/records", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(Math.max(1, Number(req.query.pageSize ?? 25)), 200);

  const [items, total] = await Promise.all([
    prisma.leadershipInputRecord.findMany({
      where: { jobId: id.data },
      orderBy: { rowIndex: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leadershipInputRecord.count({ where: { jobId: id.data } }),
  ]);

  return res.json({ page, pageSize, total, items });
});

jobsRouter.post("/:id/verify", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const job = await prisma.job.findUnique({ where: { id: id.data } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const summary = await verifyJob(id.data);
  return res.json({ ok: true, summary });
});

jobsRouter.post("/:id/enrich-emails", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const job = await prisma.job.findUnique({ where: { id: id.data } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const summary = await enrichEmailsForJob(id.data);
  return res.json({ ok: true, summary });
});

jobsRouter.post("/:id/enrich", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const job = await prisma.job.findUnique({ where: { id: id.data } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const bodySchema = z.object({
    recordIds: z.array(z.string().uuid()).optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request body", details: body.error });
  }

  const recordIds = body.data.recordIds;

  void enrichPdlForJob(id.data, recordIds).catch((error) => {
    console.error(`PDL enrichment failed for job ${id.data}:`, error);
  });

  return res.json({
    ok: true,
    jobId: id.data,
    message: "PDL enrichment started in background",
    recordIds: recordIds?.length ?? "all",
  });
});

jobsRouter.get("/:id/results", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid job id" });

  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(Math.max(1, Number(req.query.pageSize ?? 25)), 200);

  const [items, total] = await Promise.all([
    prisma.leadershipInputRecord.findMany({
      where: { jobId: id.data },
      orderBy: { rowIndex: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { verification: true },
    }),
    prisma.leadershipInputRecord.count({ where: { jobId: id.data } }),
  ]);

  const mapped = items.map((r) => ({
    filer_ein: r.filerEin,
    org_name: r.orgName,
    website: r.websiteRaw,
    employee_name: r.employeeNameRaw,
    employee_title: r.employeeTitleRaw,
    comp_org: r.compOrg,

    current_status: r.verification?.currentStatus
      ? r.verification.currentStatus === "STILL_EMPLOYED"
        ? "Still employed"
        : r.verification.currentStatus === "LEFT_ORGANIZATION"
          ? "Left organization"
          : "Unknown"
      : "Unknown",

    verified_email: r.verification?.verifiedEmail ?? "",
    email_type:
      r.verification?.emailType === "WORK_VERIFIED"
        ? "Work (verified)"
        : r.verification?.emailType === "WORK_UNVERIFIED"
          ? "Work (unverified)"
          : r.verification?.emailType === "PERSONAL"
            ? "Personal"
            : "Not found",

    current_title: r.verification?.currentTitle ?? "",
    confidence_level: r.verification?.confidenceLevel ?? "LOW",
    data_sources: JSON.stringify(r.verification?.dataSources ?? []),
    last_verified_date: r.verification?.lastVerifiedAt
      ? r.verification.lastVerifiedAt.toISOString()
      : "",
    cost_per_record: r.verification?.costPerRecordUsd?.toString?.() ?? "0",

    pdl_email: r.verification?.pdlEmail ?? "",
    pdl_phone: r.verification?.pdlPhone ?? "",
    pdl_linkedin: r.verification?.pdlLinkedin ?? "",
    pdl_job_title: r.verification?.pdlJobTitle ?? "",
    pdl_seniority: r.verification?.pdlSeniority ?? "",
    pdl_organization: r.verification?.pdlOrganization ?? "",
    pdl_confidence_score: r.verification?.pdlConfidenceScore?.toString() ?? "",
    pdl_enriched_at: r.verification?.pdlEnrichedAt
      ? r.verification.pdlEnrichedAt.toISOString()
      : "",
  }));

  return res.json({ page, pageSize, total, items: mapped });
});

jobsRouter.get("/:id/export", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).send("Invalid job id");

  const rows = await prisma.leadershipInputRecord.findMany({
    where: { jobId: id.data },
    orderBy: { rowIndex: "asc" },
    include: { verification: true },
  });

  const data = rows.map((r) => ({
    filer_ein: r.filerEin,
    org_name: r.orgName,
    website: r.websiteRaw ?? "",
    employee_name: r.employeeNameRaw,
    employee_title: r.employeeTitleRaw ?? "",
    comp_org: r.compOrg ?? "",

    current_status: r.verification?.currentStatus
      ? r.verification.currentStatus === "STILL_EMPLOYED"
        ? "Still employed"
        : r.verification.currentStatus === "LEFT_ORGANIZATION"
          ? "Left organization"
          : "Unknown"
      : "Unknown",

    verified_email: r.verification?.verifiedEmail ?? "",
    email_type:
      r.verification?.emailType === "WORK_VERIFIED"
        ? "Work (verified)"
        : r.verification?.emailType === "WORK_UNVERIFIED"
          ? "Work (unverified)"
          : r.verification?.emailType === "PERSONAL"
            ? "Personal"
            : "Not found",

    current_title: r.verification?.currentTitle ?? "",
    confidence_level: r.verification?.confidenceLevel ?? "LOW",
    data_sources: JSON.stringify(r.verification?.dataSources ?? []),
    last_verified_date: r.verification?.lastVerifiedAt
      ? r.verification.lastVerifiedAt.toISOString()
      : "",
    cost_per_record: r.verification?.costPerRecordUsd?.toString?.() ?? "0",

    pdl_email: r.verification?.pdlEmail ?? "",
    pdl_phone: r.verification?.pdlPhone ?? "",
    pdl_linkedin: r.verification?.pdlLinkedin ?? "",
    pdl_job_title: r.verification?.pdlJobTitle ?? "",
    pdl_seniority: r.verification?.pdlSeniority ?? "",
    pdl_organization: r.verification?.pdlOrganization ?? "",
    pdl_confidence_score: r.verification?.pdlConfidenceScore?.toString() ?? "",
    pdl_enriched_at: r.verification?.pdlEnrichedAt
      ? r.verification.pdlEnrichedAt.toISOString()
      : "",
  }));

  const parser = new Parser({ withBOM: true });
  const csv = parser.parse(data);

  res.header("Content-Type", "text/csv; charset=utf-8");
  res.attachment(`job-${id.data}-results.csv`);
  res.send(csv);
});
