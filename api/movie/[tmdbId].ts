import { authMiddleware } from "../../src/middleware/auth.js";
import { rateLimitMiddleware } from "../../src/middleware/rateLimit.js";
import { ok, fail } from "../../src/utils/responses.js";
import { incrementView } from "../../src/services/usage.js";
import { scrapeMovie } from "../../src/services/scrapeService.js";

export default async function handler(req: any, res: any) {
  // CORS headers
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] ||
      "authorization, content-type, x-requested-with"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  // Wrap Express-style middleware for Vercel request
  const run = (mw: any) =>
    new Promise<void>((resolve) => mw(req as any, res as any, () => resolve()));

  await run(authMiddleware);
  if ((res as any).headersSent) return;
  await run(rateLimitMiddleware);
  if ((res as any).headersSent) return;

  try {
    const tmdbId = req.query.tmdbId as string;
    if (!tmdbId) return fail(res as any, "Missing tmdbId", 400);
    const data = await scrapeMovie(tmdbId);
    if (data.m3u8.length > 0 && (req as any).apiKey) {
      await incrementView((req as any).apiKey, 1);
    }
    return ok(res as any, { m3u8: data.m3u8, subtitles: data.subtitles });
  } catch (e: any) {
    return fail(res as any, e?.message || "Scrape failed", 500);
  }
}
