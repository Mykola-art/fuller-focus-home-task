import { config } from "../../config.js";
import { RateLimiter } from "./RateLimiter.js";

export const limiters = {
  googleCse: new RateLimiter(
    config.GOOGLE_CSE_CONCURRENCY,
    config.GOOGLE_CSE_MIN_TIME_MS,
  ),
  hunter: new RateLimiter(config.HUNTER_CONCURRENCY, config.HUNTER_MIN_TIME_MS),
  zerobounce: new RateLimiter(
    config.ZEROBOUNCE_CONCURRENCY,
    config.ZEROBOUNCE_MIN_TIME_MS,
  ),
  pdl: new RateLimiter(config.PDL_CONCURRENCY, config.PDL_MIN_TIME_MS),
};
