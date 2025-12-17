const SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "md",
  "phd",
  "esq",
  "cpa",
  "dds",
  "do",
  "dvm",
]);

export type ParsedName = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  issues: string[];
};

export function parsePersonName(
  raw: string | null | undefined,
): ParsedName | null {
  if (!raw) return null;
  const issues: string[] = [];
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  if (s.includes(",")) {
    const [last, rest] = s.split(",", 2).map((x) => x.trim());
    if (last && rest) {
      s = `${rest} ${last}`.trim();
      issues.push("name_was_last_comma_first");
    }
  }

  s = s.replace(/^(mr|mrs|ms|dr)\.\s+/i, "");
  const parts = s.split(" ").filter(Boolean);

  const lastToken = parts[parts.length - 1]
    ?.replace(/[.,]/g, "")
    ?.toLowerCase();
  let suffix: string | undefined;
  if (lastToken && SUFFIXES.has(lastToken)) {
    suffix = parts.pop();
    issues.push("name_has_suffix");
  }

  if (parts.length === 1) {
    issues.push("name_single_token");
    return { firstName: parts[0], suffix, issues };
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts.slice(1, -1).join(" ") || undefined;

  return { firstName, middleName, lastName, suffix, issues };
}
