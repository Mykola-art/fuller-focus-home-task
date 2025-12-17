const API_BASE = import.meta.env.VITE_API_BASE_URL;

export type Job = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  originalFile?: string | null;
  totalRows: number;
  processedRows: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ResultRow = {
  filer_ein: string;
  org_name: string;
  website: string | null;
  employee_name: string;
  employee_title: string | null;
  comp_org: string | null;

  current_status: "Still employed" | "Left organization" | "Unknown";
  verified_email: string;
  email_type:
    | "Work (verified)"
    | "Work (unverified)"
    | "Personal"
    | "Not found";
  current_title: string;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  data_sources: string;
  last_verified_date: string;
  cost_per_record: string;
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadCsv(file: File) {
  const form = new FormData();
  form.append("file", file);
  return http<{ job: Job; ingest: { totalRows: number; errorCount: number } }>(
    "/jobs",
    { method: "POST", body: form }
  );
}

export async function runVerify(jobId: string) {
  return http<{
    ok: boolean;
    summary: { recordCount: number; totalCostUsd: number };
  }>(`/jobs/${jobId}/verify`, { method: "POST" });
}

export async function runEmailEnrich(jobId: string) {
  return http<{
    ok: boolean;
    summary: { recordCount: number; totalCostUsd: number };
  }>(`/jobs/${jobId}/enrich-emails`, { method: "POST" });
}

export async function fetchResults(jobId: string) {
  return http<{ total: number; items: ResultRow[] }>(
    `/jobs/${jobId}/results?page=1&pageSize=200`
  );
}

export function exportCsvUrl(jobId: string) {
  return `${API_BASE}/jobs/${jobId}/export`;
}
