import type { RequestHandler } from "express";
import { apiKeys } from "../utils/config.js";
import { fail } from "../utils/responses.js";

declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
    }
  }
}

export const authMiddleware: RequestHandler = (req, res, next) => {
  // One-time debug log to verify keys are loaded
  if (!(global as any).__authLogged) {
    (global as any).__authLogged = true;
    console.log(`[auth] apiKeys.size=${apiKeys.size}`);
  }
  if (apiKeys.size === 0) {
    return fail(
      res,
      "Server misconfigured: no API keys (set API_KEYS or API_TOKEN in .env)",
      500
    );
  }
  const auth = req.header("authorization") || req.header("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)/i);
  const token = (m?.[1] || "").trim();
  if (!token || !apiKeys.has(token)) {
    return fail(res, "Unauthorized", 401);
  }
  req.apiKey = token;
  return next();
};
