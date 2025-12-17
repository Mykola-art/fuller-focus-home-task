import type { LeadershipInputRecord } from "@prisma/client";
import { EmailType } from "@prisma/client";
import { config } from "../../config.js";
import { hunterFindEmail } from "../../services/hunter/hunterClient.js";
import { zerobounceValidate } from "../../services/zerobounce/zerobounceClient.js";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "live.com",
]);

function isValidEmailSyntax(email: string) {
  if (email.length > 254) return false;
  return /^(?!.*\.{2})[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);
}
function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}
function buildCandidates(rec: LeadershipInputRecord): string[] {
  const d = rec.orgDomain?.toLowerCase();
  const fn = rec.firstName?.toLowerCase();
  const ln = rec.lastName?.toLowerCase();
  if (!d || !fn || !ln) return [];
  const fi = fn[0] ?? "";
  return [`${fn}.${ln}@${d}`, `${fi}${ln}@${d}`, `${fn}${ln}@${d}`];
}

export async function enrichEmailRecord(rec: LeadershipInputRecord) {
  const checks: any = {};
  const sources: any[] = [];
  let costUsd = 0;

  let email: string | null = null;

  // 1) Optional online finder (Hunter)
  if (
    config.ENRICHMENT_MODE === "online" &&
    config.EMAIL_FINDER_PROVIDER === "hunter"
  ) {
    if (rec.orgDomain && rec.firstName && rec.lastName) {
      const r = await hunterFindEmail({
        domain: rec.orgDomain,
        firstName: rec.firstName,
        lastName: rec.lastName,
      });
      costUsd += r.costUsd;

      const found = r.response?.data?.email ?? null;
      if (found) {
        email = found;
        sources.push({
          provider: "hunter",
          score: r.response?.data?.score,
          position: r.response?.data?.position,
          sources: (r.response?.data?.sources ?? []).slice(0, 3),
        });
      }
    }
  }

  // 2) Fallback to pattern guess
  if (!email) {
    const candidates = buildCandidates(rec);
    email = candidates[0] ?? null;
    if (email)
      sources.push({ provider: "pattern_guess", pattern: "first.last" });
  }

  if (!email) {
    return {
      verifiedEmail: null,
      emailType: EmailType.NOT_FOUND,
      checks: { reason: "missing_name_or_domain" },
      sources,
      emailCostUsd: costUsd,
    };
  }

  // 3) Local validation/classification
  checks.syntaxValid = isValidEmailSyntax(email);
  checks.domain = emailDomain(email);
  checks.isFreeMailbox = FREE_EMAIL_DOMAINS.has(checks.domain);
  checks.domainMatchesOrg =
    !!rec.orgDomain && checks.domain === rec.orgDomain.toLowerCase();

  let emailType: EmailType = checks.isFreeMailbox
    ? EmailType.PERSONAL
    : EmailType.WORK_UNVERIFIED;

  // 4) Optional online validation (ZeroBounce)
  if (
    config.ENRICHMENT_MODE === "online" &&
    config.EMAIL_VERIFIER_PROVIDER === "zerobounce" &&
    checks.syntaxValid
  ) {
    const r = await zerobounceValidate(email);
    costUsd += r.costUsd;

    sources.push({
      provider: "zerobounce",
      status: r.response?.status,
      sub_status: r.response?.sub_status,
    });
    checks.zerobounce = r.response;

    if (r.response?.status === "valid") {
      emailType = checks.isFreeMailbox
        ? EmailType.PERSONAL
        : EmailType.WORK_VERIFIED;
    }
  }

  return {
    verifiedEmail: email,
    emailType,
    checks,
    sources,
    emailCostUsd: costUsd,
  };
}
