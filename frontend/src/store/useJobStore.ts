import { create } from "zustand";
import {
  fetchResults,
  runEmailEnrich,
  runVerify,
  uploadCsv,
  type Job,
  type ResultRow,
} from "../api/client";

type Step =
  | "idle"
  | "uploading"
  | "uploaded"
  | "verifying"
  | "verified"
  | "enriching"
  | "enriched"
  | "ready"
  | "error";

type Filters = {
  q: string;
  status: "ALL" | "Still employed" | "Left organization" | "Unknown";
  confidence: "ALL" | "HIGH" | "MEDIUM" | "LOW";
  email:
    | "ALL"
    | "Work (verified)"
    | "Work (unverified)"
    | "Personal"
    | "Not found";
};

type State = {
  step: Step;
  error?: string;
  job?: Job;
  rows: ResultRow[];
  filtered: ResultRow[];
  filters: Filters;
  totals: {
    total: number;
    still: number;
    left: number;
    unknown: number;
    high: number;
    medium: number;
    low: number;
  };
  costs: { verifyUsd?: number; emailUsd?: number };
  actions: {
    reset: () => void;
    setFilters: (partial: Partial<Filters>) => void;
    upload: (file: File) => Promise<void>;
    verify: () => Promise<void>;
    enrichEmails: () => Promise<void>;
    refreshResults: () => Promise<void>;
  };
};

const defaultFilters: Filters = {
  q: "",
  status: "ALL",
  confidence: "ALL",
  email: "ALL",
};

function computeTotals(rows: ResultRow[]) {
  const t = {
    total: rows.length,
    still: 0,
    left: 0,
    unknown: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const r of rows) {
    if (r.current_status === "Still employed") t.still++;
    else if (r.current_status === "Left organization") t.left++;
    else t.unknown++;

    if (r.confidence_level === "HIGH") t.high++;
    else if (r.confidence_level === "MEDIUM") t.medium++;
    else t.low++;
  }
  return t;
}

function applyFilters(rows: ResultRow[], f: Filters) {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status !== "ALL" && r.current_status !== f.status) return false;
    if (f.confidence !== "ALL" && r.confidence_level !== f.confidence)
      return false;
    if (f.email !== "ALL" && r.email_type !== f.email) return false;
    if (!q) return true;
    const hay = `${r.org_name} ${r.employee_name} ${r.employee_title ?? ""} ${
      r.website ?? ""
    } ${r.verified_email}`.toLowerCase();
    return hay.includes(q);
  });
}

export const useJobStore = create<State>((set, get) => ({
  step: "idle",
  rows: [],
  filtered: [],
  filters: defaultFilters,
  totals: computeTotals([]),
  costs: {},

  actions: {
    reset: () =>
      set({
        step: "idle",
        error: undefined,
        job: undefined,
        rows: [],
        filtered: [],
        filters: defaultFilters,
        totals: computeTotals([]),
        costs: {},
      }),

    setFilters: (partial) => {
      const filters = { ...get().filters, ...partial };
      set({ filters, filtered: applyFilters(get().rows, filters) });
    },

    upload: async (file) => {
      set({ step: "uploading", error: undefined });
      try {
        const { job } = await uploadCsv(file);
        set({ job, step: "uploaded" });
        await get().actions.refreshResults();
      } catch (e: any) {
        set({ step: "error", error: e?.message ?? "Upload failed" });
      }
    },

    verify: async () => {
      const job = get().job;
      if (!job) return;
      set({ step: "verifying", error: undefined });
      try {
        const r = await runVerify(job.id);
        set({
          step: "verified",
          costs: { ...get().costs, verifyUsd: r.summary.totalCostUsd },
        });
        await get().actions.refreshResults();
      } catch (e: any) {
        set({ step: "error", error: e?.message ?? "Verification failed" });
      }
    },

    enrichEmails: async () => {
      const job = get().job;
      if (!job) return;
      set({ step: "enriching", error: undefined });
      try {
        const r = await runEmailEnrich(job.id);
        set({
          step: "enriched",
          costs: { ...get().costs, emailUsd: r.summary.totalCostUsd },
        });
        await get().actions.refreshResults();
      } catch (e: any) {
        set({ step: "error", error: e?.message ?? "Email enrichment failed" });
      }
    },

    refreshResults: async () => {
      const job = get().job;
      if (!job) return;
      const data = await fetchResults(job.id);
      const rows = data.items;
      const totals = computeTotals(rows);
      const filtered = applyFilters(rows, get().filters);
      set({ rows, filtered, totals, step: "ready" });
    },
  },
}));
