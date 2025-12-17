import { CurrentStatus, VerifyMode } from "@prisma/client";
import type { LeadershipInputRecord } from "@prisma/client";
import { config } from "../../config.js";
import { googleCseSearch } from "../../services/googleCse/googleCseClient.js";

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
    t,
  );

function nameMatches(text: string, rec: LeadershipInputRecord) {
  const t = norm(text);
  const fn = rec.firstName ? norm(rec.firstName) : "";
  const ln = rec.lastName ? norm(rec.lastName) : "";
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
    /(President\s*(?:and|&)\s*CEO|Chief Executive Officer|Executive Director|CEO)/i,
  );
  return m?.[1] ?? null;
}

function extractOtherCeo(snippet: string): string | null {
  const m = snippet.match(
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*,\s*(?:CEO|Chief Executive Officer|Executive Director)/,
  );
  return m?.[1] ?? null;
}

export async function verifyRecord(rec: LeadershipInputRecord) {
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

  const queries: { type: Source["type"]; q: string }[] = [];
  if (rec.orgDomain)
    queries.push({
      type: "org_site",
      q: `site:${rec.orgDomain} (CEO OR "Chief Executive" OR "Executive Director") "${rec.employeeNameRaw}"`,
    });
  queries.push({
    type: "web",
    q: `"${rec.orgName}" "${rec.employeeNameRaw}" (CEO OR "Chief Executive" OR "Executive Director")`,
  });
  queries.push({
    type: "web",
    q: `"${rec.orgName}" (CEO OR "Chief Executive" OR "Executive Director")`,
  });

  const items: Array<{ item: any; type: Source["type"]; q: string }> = [];

  for (const { type, q } of queries) {
    const r = await googleCseSearch(q, 5);
    costUsd += r.costUsd;
    for (const it of r.response.items ?? []) items.push({ item: it, type, q });
  }

  for (const it of items) {
    const text = `${it.item.title ?? ""} ${it.item.snippet ?? ""}`;
    if (it.type === "org_site" && nameMatches(text, rec) && hasLeaderKw(text)) {
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
      };
    }
  }

  for (const it of items) {
    const sn = it.item.snippet ?? "";
    if (!hasLeaderKw(sn)) continue;
    const other = extractOtherCeo(sn);
    if (other && rec.lastName && !norm(other).includes(norm(rec.lastName))) {
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
      };
    }
  }

  for (const it of items.slice(0, 5))
    sources.push({
      type: it.type,
      query: it.q,
      url: it.item.link,
      title: it.item.title,
      snippet: it.item.snippet,
      evidenceDate: extractEvidenceDate(it.item),
    });

  return {
    mode: VerifyMode.ONLINE,
    currentStatus: CurrentStatus.UNKNOWN,
    currentTitle: null,
    evidenceDate: null,
    dataSources: sources,
    notes: "No strong match",
    costUsd,
  };
}
