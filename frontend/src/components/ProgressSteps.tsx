import React from "react";

export type StepKey = "Upload" | "Verify" | "Enrich Emails" | "Export";
export default function ProgressSteps({
  active,
  done,
}: {
  active: StepKey;
  done: StepKey[];
}) {
  const steps: StepKey[] = ["Upload", "Verify", "Enrich Emails", "Export"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s) => {
        const isDone = done.includes(s);
        const isActive = active === s;
        const cls = isDone
          ? "bg-primary-700 text-white ring-primary-700"
          : isActive
          ? "bg-primary-100 text-primary-800 ring-primary-200"
          : "bg-white text-gray-600 ring-gray-200";
        return (
          <div
            key={s}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}
          >
            {s}
          </div>
        );
      })}
    </div>
  );
}
