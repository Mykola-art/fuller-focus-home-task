export function normalizeWebsiteToDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const cleaned = input
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[),.;]+$/g, "");
  if (!cleaned) return null;
  const withProto = cleaned.match(/^https?:\/\//i)
    ? cleaned
    : `https://${cleaned}`;
  try {
    const url = new URL(withProto);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (!host.includes(".")) return null;
    if (!/^[a-z0-9.-]+$/.test(host)) return null;
    return host.replace(/^\.+|\.+$/g, "") || null;
  } catch {
    return null;
  }
}
