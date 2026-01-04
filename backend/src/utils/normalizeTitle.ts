const FORMER_KW = /(former|ex-|retired|past)\b/i;
const ACTING_KW = /\b(acting|interim)\b/i;

export function normalizeTitle(raw?: string | null): {
  primaryRole: "CEO" | "EXEC_DIR" | "PRESIDENT_CEO" | "OTHER" | null;
  isFormer: boolean;
  isActingOrInterim: boolean;
  cleaned: string | null;
} {
  if (!raw)
    return {
      primaryRole: null,
      isFormer: false,
      isActingOrInterim: false,
      cleaned: null,
    };

  const cleaned = raw.replace(/\s+/g, " ").trim();

  const isFormer = FORMER_KW.test(cleaned);
  const isActingOrInterim = ACTING_KW.test(cleaned);

  const t = cleaned.toLowerCase();

  const hasCeo = /\bceo\b|chief executive/i.test(t);
  const hasExecDir = /executive director/i.test(t);
  const hasPresident = /\bpresident\b/i.test(t);

  let primaryRole: "CEO" | "EXEC_DIR" | "PRESIDENT_CEO" | "OTHER" | null =
    "OTHER";
  if (hasPresident && hasCeo) primaryRole = "PRESIDENT_CEO";
  else if (hasCeo) primaryRole = "CEO";
  else if (hasExecDir) primaryRole = "EXEC_DIR";

  return { primaryRole, isFormer, isActingOrInterim, cleaned };
}
