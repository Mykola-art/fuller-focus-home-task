const SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "md",
  "m.d",
  "phd",
  "ph.d",
  "dds",
  "dmd",
  "esq",
  "mba",
  "cpa",
  "jd",
  "dvm",
  "do",
]);

const STOPWORDS = new Set(["mr", "mrs", "ms", "dr", "prof"]);

const isInitial = (t: string) => /^[a-z]\.?$/i.test(t);

function cleanToken(t: string) {
  return t.replace(/[.,]/g, "").trim();
}

export function normalizeNameForSearch(raw: string): {
  normalized: string; // "John Murphy"
  first?: string;
  last?: string;
  notes: string[];
} {
  const notes: string[] = [];
  if (!raw || !raw.trim()) return { normalized: "", notes: ["empty_name"] };

  // Keep hyphens (Smith-Jones), remove commas as separators
  const s = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  let tokens = s.split(" ").map(cleanToken).filter(Boolean);

  // drop honorifics
  const beforeLen = tokens.length;
  tokens = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  if (tokens.length !== beforeLen) notes.push("dropped_honorific");

  // drop suffixes / degrees anywhere
  const before2 = tokens.length;
  tokens = tokens.filter((t) => !SUFFIXES.has(t.toLowerCase()));
  if (tokens.length !== before2) notes.push("dropped_suffix");

  // drop middle initials
  const before3 = tokens.length;
  tokens = tokens.filter(
    (t, idx) => idx === 0 || idx === tokens.length - 1 || !isInitial(t)
  );
  if (tokens.length !== before3) notes.push("dropped_initial");

  if (tokens.length < 2) {
    return {
      normalized: tokens.join(" "),
      first: tokens[0],
      notes: [...notes, "name_too_short"],
    };
  }

  // Detect "Last First" pattern (e.g., "Smith John", "Korsnick Maria G")
  // Heuristic: if the last token looks like a first name? We don’t have a dictionary,
  // so we use a simple signal: if raw contains "LAST FIRST" style (all caps or reversed order in dataset),
  // and if first token is longer than 2 and second token is longer than 2, we allow swap when rec.firstName/lastName missing.
  // For our use: if your parser already extracted first/last, use those. Otherwise try swap.
  if (tokens.length >= 2) {
    const [a, b] = tokens;
    // If the original had comma or all-caps, assume it might be reversed.
    // Also handle specific “last first” cases safely by swapping when there are exactly 2–3 tokens.
    const looksReversed =
      raw.includes(",") ||
      (a.toUpperCase() === a && b.toUpperCase() !== b) ||
      (tokens.length <= 3 && raw === raw.toUpperCase());

    if (looksReversed && tokens.length >= 2) {
      notes.push("maybe_reversed");
      // We won’t always swap; we’ll generate a normalized search name using "First Last" assumption.
      // For 2 tokens: swap. For 3 tokens: treat as Last First MiddleInitial → swap first two.
      if (tokens.length === 2) tokens = [b, a];
      else if (tokens.length === 3) tokens = [tokens[1], tokens[0]]; // drop middle already, so usually becomes 2
    }
  }

  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  // final normalized “First Last”
  const normalized = `${first} ${last}`.replace(/\s+/g, " ").trim();

  // record-specific example signals (helps debugging)
  if (normalized !== raw.trim()) notes.push("normalized_changed");

  return { normalized, first, last, notes };
}
