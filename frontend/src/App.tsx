import React, { useMemo } from "react";
import UploadCard from "./components/UploadCard";
import Button from "./components/Button";
import FiltersBar from "./components/FiltersBar";
import ResultsTable from "./components/ResultsTable";
import ProgressSteps, { StepKey } from "./components/ProgressSteps";
import { exportCsvUrl } from "./api/client";
import { useJobStore } from "./store/useJobStore";

function formatUsd(n?: number) {
  if (n === undefined) return "—";
  return `$${n.toFixed(4)}`;
}

export default function App() {
  const { step, job, filtered, totals, error, costs } = useJobStore((s) => ({
    step: s.step,
    job: s.job,
    filtered: s.filtered,
    totals: s.totals,
    error: s.error,
    costs: s.costs,
  }));

  const { verify, enrichEmails, refreshResults } = useJobStore(
    (s) => s.actions
  );

  const busy =
    step === "uploading" || step === "verifying" || step === "enriching";
  const exportUrl = job ? exportCsvUrl(job.id) : "";

  const steps = useMemo(() => {
    const done: ("Upload" | "Verify" | "Enrich Emails" | "Export")[] = [];
    if (job) done.push("Upload");
    if (costs.verifyUsd !== undefined) done.push("Verify");
    if (costs.emailUsd !== undefined) done.push("Enrich Emails");
    const active: StepKey = !job
      ? "Upload"
      : costs.verifyUsd === undefined
      ? "Verify"
      : costs.emailUsd === undefined
      ? "Enrich Emails"
      : "Export";
    return { active, done };
  }, [job, costs.verifyUsd, costs.emailUsd]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-primary-800">
                Fuller focus home task
              </h1>
              <p className="text-sm text-gray-600">
                Upload → Verify → Enrich Emails → Export
              </p>
            </div>
            <ProgressSteps active={steps.active} done={steps.done} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <UploadCard />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-700">
              <div>
                Job: <span className="font-semibold">{job ? job.id : "—"}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>
                  Total: <b>{totals.total}</b>
                </span>
                <span className="text-green-700">
                  Still: <b>{totals.still}</b>
                </span>
                <span className="text-red-700">
                  Left: <b>{totals.left}</b>
                </span>
                <span className="text-orange-700">
                  Unknown: <b>{totals.unknown}</b>
                </span>
                <span>
                  Verify cost: <b>{formatUsd(costs.verifyUsd)}</b>
                </span>
                <span>
                  Email cost: <b>{formatUsd(costs.emailUsd)}</b>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={!job || busy} onClick={verify}>
                {step === "verifying" ? "Verifying…" : "Run Verify"}
              </Button>
              <Button disabled={!job || busy} onClick={enrichEmails}>
                {step === "enriching" ? "Enriching…" : "Enrich Emails"}
              </Button>
              <Button
                variant="ghost"
                disabled={!job || busy}
                onClick={refreshResults}
              >
                Refresh
              </Button>

              <a
                href={exportUrl || "#"}
                onClick={(e) => {
                  if (!job) e.preventDefault();
                }}
                className={[
                  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition",
                  job
                    ? "bg-white text-primary-700 ring-1 ring-inset ring-primary-200 hover:bg-primary-50"
                    : "pointer-events-none opacity-50 bg-white text-primary-700 ring-1 ring-inset ring-primary-200",
                ].join(" ")}
              >
                Export CSV
              </a>
            </div>
          </div>
        </div>

        {job && <FiltersBar />}

        <ResultsTable rows={filtered} />
      </main>
    </div>
  );
}
