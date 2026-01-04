import { CurrentStatus, VerifyMode } from "@prisma/client";
import type { LeadershipInputRecord } from "@prisma/client";
import { config } from "../../config.js";
import { googleCseSearch } from "../../services/googleCse/googleCseClient.js";
import { normalizeNameForSearch } from "../../utils/normalizePerson.js";
import { normalizeTitle } from "../../utils/normalizeTitle.js";

type Source = {
  type: "org_site" | "web" | "offline";
  query?: string;
  url?: string;
  title?: string;
  snippet?: string;
  evidenceDate?: string;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasLeaderKw = (t: string) =>
  /(chief executive|ceo|executive director|president\s*&\s*ceo|president and ceo)/i.test(
    t
  );

const hasFormerKw = (t: string) => /\bformer\b|\bretired\b|\bex-\b/i.test(t);

function nameMatches(text: string, first?: string, last?: string) {
  const t = norm(text);
  const fn = first ? norm(first) : "";
  const ln = last ? norm(last) : "";
  return !!fn && !!ln && t.includes(fn) && t.includes(ln);
}

function extractEvidenceDate(item: any): string | undefined {
  const tags = item?.pagemap?.metatags?.[0];
  const c =
    tags?.["article:published_time"] ||
    tags?.["article:modified_time"] ||
    tags?.["og:updated_time"] ||
    tags?.["date"];
  return typeof c === "string" ? c : undefined;
}

function extractTitle(snippet: string): string | null {
  const m = snippet.match(
    /(President\s*(?:and|&)\s*CEO|Chief Executive Officer|Executive Director|CEO)/i
  );
  return m?.[1] ?? null;
}

function extractOtherCeo(snippet: string): string | null {
  const m = snippet.match(
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*,\s*(?:CEO|Chief Executive Officer|Executive Director)/
  );
  return m?.[1] ?? null;
}

export async function verifyRecord(rec: LeadershipInputRecord) {
  //TODO: think more about offline mode and it's capabilities

  if (config.ENRICHMENT_MODE === "offline") {
    const sources: Source[] = [
      {
        type: "offline",
        snippet: "Offline mode: no external lookups performed",
      },
    ];
    return {
      mode: VerifyMode.OFFLINE,
      currentStatus: CurrentStatus.UNKNOWN,
      currentTitle: null,
      evidenceDate: null,
      dataSources: sources,
      notes: "Offline-only mode",
      costUsd: 0,
    };
  }

  const sources: Source[] = [];
  let costUsd = 0;

  // Normalize name for search + matching
  const nm = normalizeNameForSearch(rec.employeeNameRaw);
  const normalizedName = nm.normalized || rec.employeeNameRaw;

  // Prefer existing parsed first/last, but fall back to normalized extraction
  const first = rec.firstName ?? nm.first;
  const last = rec.lastName ?? nm.last;

  // Normalize title intent
  const t = normalizeTitle(rec.employeeTitleRaw);

  const queries: { type: Source["type"]; q: string }[] = [];

  const leaderTerms = `(CEO OR "Chief Executive" OR "Executive Director" OR "President and CEO")`;

  if (rec.orgDomain) {
    queries.push({
      type: "org_site",
      q: `site:${rec.orgDomain} "${normalizedName}" ${leaderTerms}`,
    });
  }

  queries.push({
    type: "web",
    q: `"${rec.orgName}" "${normalizedName}" ${leaderTerms}`,
  });

  // HARD CAP to avoid Google quota burn (free is 100/day) :contentReference[oaicite:4]{index=4}
  const capped = queries.slice(
    0,
    Math.max(1, config.GOOGLE_CSE_MAX_QUERIES_PER_RECORD)
  );

  const items: Array<{ item: any; type: Source["type"]; q: string }> = [];

  try {
    for (const { type, q } of capped) {
      const r = await googleCseSearch(q, 5);
      costUsd += r.costUsd;
      for (const it of r.response.items ?? [])
        items.push({ item: it, type, q });
    }
  } catch (e: any) {
    // On 429 / rate issues, return UNKNOWN with note; don't crash job
    sources.push({
      type: capped[0]?.type ?? "web",
      query: capped[0]?.q,
      snippet: `lookup_error: ${String(e?.message ?? e ?? "unknown")}`,
    });
    return {
      mode: VerifyMode.ONLINE,
      currentStatus: CurrentStatus.UNKNOWN,
      currentTitle: null,
      evidenceDate: null,
      dataSources: sources,
      notes:
        "External lookup failed (rate limit/quota). Try again later or reduce queries.",
      costUsd,
      unknownReason: "rate_limited_or_quota",
    };
  }

  if (!items.length) {
    return {
      mode: VerifyMode.ONLINE,
      currentStatus: CurrentStatus.UNKNOWN,
      currentTitle: null,
      evidenceDate: null,
      dataSources: sources,
      notes: "No search hits",
      costUsd,
      unknownReason: nm.normalized
        ? "no_search_hits"
        : "name_normalization_issue",
    };
  }

  // A) If we see “Former” tied to THIS person + leadership keyword => lean LEFT
  for (const it of items) {
    const text = `${it.item.title ?? ""} ${it.item.snippet ?? ""}`;
    if (
      nameMatches(text, first, last) &&
      hasLeaderKw(text) &&
      hasFormerKw(text)
    ) {
      const d = extractEvidenceDate(it.item);
      sources.push({
        type: it.type,
        query: it.q,
        url: it.item.link,
        title: it.item.title,
        snippet: it.item.snippet,
        evidenceDate: d,
      });
      return {
        mode: VerifyMode.ONLINE,
        currentStatus: CurrentStatus.LEFT_ORGANIZATION,
        currentTitle: null,
        evidenceDate: d ? new Date(d) : null,
        dataSources: sources,
        notes: `Matched "Former" leadership mention for this person`,
        costUsd,
        unknownReason: null,
      };
    }
  }

  // B) Strong org-site match => still employed, but avoid false positives when “former” appears
  for (const it of items) {
    const text = `${it.item.title ?? ""} ${it.item.snippet ?? ""}`;
    if (
      it.type === "org_site" &&
      nameMatches(text, first, last) &&
      hasLeaderKw(text) &&
      !hasFormerKw(text)
    ) {
      const d = extractEvidenceDate(it.item);
      sources.push({
        type: "org_site",
        query: it.q,
        url: it.item.link,
        title: it.item.title,
        snippet: it.item.snippet,
        evidenceDate: d,
      });
      return {
        mode: VerifyMode.ONLINE,
        currentStatus: CurrentStatus.STILL_EMPLOYED,
        currentTitle: it.item.snippet ? extractTitle(it.item.snippet) : null,
        evidenceDate: d ? new Date(d) : null,
        dataSources: sources,
        notes: "Matched org-site result",
        costUsd,
        unknownReason: null,
      };
    }
  }

  // C) Detect different CEO name
  for (const it of items) {
    const sn = it.item.snippet ?? "";
    if (!hasLeaderKw(sn)) continue;
    const other = extractOtherCeo(sn);
    if (other && last && !norm(other).includes(norm(last))) {
      sources.push({
        type: it.type,
        query: it.q,
        url: it.item.link,
        title: it.item.title,
        snippet: sn,
        evidenceDate: extractEvidenceDate(it.item),
      });
      return {
        mode: VerifyMode.ONLINE,
        currentStatus: CurrentStatus.LEFT_ORGANIZATION,
        currentTitle: null,
        evidenceDate: null,
        dataSources: sources,
        notes: `Detected different CEO name: ${other}`,
        costUsd,
        unknownReason: null,
      };
    }
  }

  // D) Attach top evidence for debugging
  for (const it of items.slice(0, 5)) {
    sources.push({
      type: it.type,
      query: it.q,
      url: it.item.link,
      title: it.item.title,
      snippet: it.item.snippet,
      evidenceDate: extractEvidenceDate(it.item),
    });
  }

  // Decide unknown reason
  let unknownReason = "no_strong_match";
  if (nm.notes.includes("name_too_short")) unknownReason = "name_too_short";
  if (t.isFormer) unknownReason = "title_suggests_former_but_not_confirmed";
  if (t.isActingOrInterim) unknownReason = "acting_or_interim_neutral";

  return {
    mode: VerifyMode.ONLINE,
    currentStatus: CurrentStatus.UNKNOWN,
    currentTitle: null,
    evidenceDate: null,
    dataSources: sources,
    notes: "No strong match",
    costUsd,
    unknownReason,
  };
}
