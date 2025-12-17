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
