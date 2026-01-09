import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  ENRICHMENT_MODE: z.enum(["offline", "online"]).default("offline"),

  GOOGLE_CSE_API_KEY: z.string().optional().default(""),
  GOOGLE_CSE_CX: z.string().optional().default(""),
  GOOGLE_CSE_COST_PER_QUERY_USD: z.coerce.number().default(0.005),

  EMAIL_FINDER_PROVIDER: z.enum(["none", "hunter"]).default("none"),
  HUNTER_API_KEY: z.string().optional().default(""),
  HUNTER_COST_PER_LOOKUP_USD: z.coerce.number().default(0.02),

  EMAIL_VERIFIER_PROVIDER: z.enum(["none", "zerobounce"]).default("none"),
  ZEROBOUNCE_API_KEY: z.string().optional().default(""),
  ZEROBOUNCE_COST_PER_VERIFY_USD: z.coerce.number().default(0.004),

  PDL_API_KEY: z.string().optional().default(""),
  PDL_COST_PER_ENRICHMENT_USD: z.coerce.number().default(0.05),

  // HTTP retry behavior
  HTTP_RETRIES: z.preprocess(
    (v) => (v === undefined || v === "" ? 3 : Number(v)),
    z.number().int().finite(),
  ),
  HTTP_BASE_DELAY_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 500 : Number(v)),
    z.number().int().finite(),
  ),
  HTTP_MAX_DELAY_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 10_000 : Number(v)),
    z.number().int().finite(),
  ),

  // Worker concurrency (records processed in parallel)
  WORKER_CONCURRENCY: z.preprocess(
    (v) => (v === undefined || v === "" ? 2 : Number(v)),
    z.number().int().finite(),
  ),

  // Per-provider throttling (minimal defaults)
  GOOGLE_CSE_CONCURRENCY: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().finite(),
  ),
  GOOGLE_CSE_MIN_TIME_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 600 : Number(v)),
    z.number().int().finite(),
  ),
  GOOGLE_CSE_MAX_QUERIES_PER_RECORD: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().finite(),
  ),

  HUNTER_CONCURRENCY: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().finite(),
  ),
  HUNTER_MIN_TIME_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 300 : Number(v)),
    z.number().int().finite(),
  ),

  ZEROBOUNCE_CONCURRENCY: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().finite(),
  ),
  ZEROBOUNCE_MIN_TIME_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 150 : Number(v)),
    z.number().int().finite(),
  ),

  PDL_CONCURRENCY: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : Number(v)),
    z.number().int().finite(),
  ),
  PDL_MIN_TIME_MS: z.preprocess(
    (v) => (v === undefined || v === "" ? 200 : Number(v)),
    z.number().int().finite(),
  ),
});

export const config = ConfigSchema.parse(process.env);

export function requireOnlineConfig() {
  if (config.ENRICHMENT_MODE !== "online") return;
  if (!config.GOOGLE_CSE_API_KEY || !config.GOOGLE_CSE_CX) {
    throw new Error(
      "ENRICHMENT_MODE=online requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX",
    );
  }
}
