import type { RequestHandler } from "express";
import { RATE_LIMIT_PER_MIN, RATE_LIMIT_BURST } from "../utils/config.js";
import { getRateState } from "../services/usage.js";
import { fail } from "../utils/responses.js";

// Simple token bucket: refill RATE_LIMIT_PER_MIN tokens per minute, capacity RATE_LIMIT_BURST
export const rateLimitMiddleware: RequestHandler = (req, res, next) => {
  const apiKey = req.apiKey || "anonymous";
  const state = getRateState(apiKey);
  const now = Date.now();
  const perMin = Math.max(1, RATE_LIMIT_PER_MIN);
  const capacity = Math.max(perMin, RATE_LIMIT_BURST);
  const refillRate = perMin / 60_000; // tokens per ms
  const elapsed = Math.max(0, now - state.lastRefill);
  state.tokens = Math.min(capacity, state.tokens + elapsed * refillRate);
  state.lastRefill = now;
  if (state.tokens < 1) {
    return fail(res, "Rate limit exceeded", 429);
  }
  state.tokens -= 1;
  return next();
};
