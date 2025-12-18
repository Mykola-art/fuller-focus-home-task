import { config } from "../../config.js";

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const asInt = Number(value);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const ms = asDate - Date.now();
    return ms > 0 ? ms : 0;
  }
  return null;
}

type RetryOpts = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryStatuses?: number[];
};

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOpts,
): Promise<Response> {
  const retries = opts?.retries ?? config.HTTP_RETRIES;
  const baseDelayMs = opts?.baseDelayMs ?? config.HTTP_BASE_DELAY_MS;
  const maxDelayMs = opts?.maxDelayMs ?? config.HTTP_MAX_DELAY_MS;
  const retryStatuses = opts?.retryStatuses ?? [429, 500, 502, 503, 504];

  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(url, init);

      if (!retryStatuses.includes(res.status) || attempt >= retries) {
        return res;
      }

      const ra = parseRetryAfterMs(res.headers.get("retry-after"));
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const delay = ra !== null ? Math.min(maxDelayMs, ra) : backoff;

      attempt += 1;
      await sleep(delay);
      continue;
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      attempt += 1;
      await sleep(delay);
    }
  }
}
