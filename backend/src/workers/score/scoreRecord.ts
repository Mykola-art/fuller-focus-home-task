import { ConfidenceLevel, CurrentStatus, EmailType } from "@prisma/client";

export function scoreRecord(v: {
  currentStatus: CurrentStatus;
  dataSources: any | null;
  evidenceDate: Date | null;
  emailType: EmailType;
}) {
  const sources = Array.isArray(v.dataSources) ? v.dataSources : [];
  const hasOrgSource = sources.some((s) => s?.type === "org_site");
  const sourceCount = sources.length;

  const daysOld = v.evidenceDate
    ? (Date.now() - v.evidenceDate.getTime()) / 86400000
    : Infinity;
  const recent90 = daysOld <= 90;
  const recent365 = daysOld <= 365;

  if (
    v.currentStatus === CurrentStatus.STILL_EMPLOYED &&
    recent90 &&
    hasOrgSource &&
    sourceCount >= 2 &&
    v.emailType === EmailType.WORK_VERIFIED
  )
    return ConfidenceLevel.HIGH;

  if (
    v.currentStatus === CurrentStatus.STILL_EMPLOYED &&
    (recent365 || hasOrgSource) &&
    v.emailType !== EmailType.PERSONAL
  )
    return ConfidenceLevel.MEDIUM;

  return ConfidenceLevel.LOW;
}
