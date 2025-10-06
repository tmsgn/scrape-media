import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { ok, fail } from "../utils/responses.js";
import { incrementView } from "../services/usage.js";
import { scrapeMovie, scrapeEpisode } from "../services/scrapeService.js";

export function buildRouter() {
  const r = Router();

  // Movie
  r.get(
    "/movie/:tmdbId",
    authMiddleware,
    rateLimitMiddleware,
    async (req, res) => {
      try {
        const tmdbId = req.params.tmdbId;
        if (!tmdbId) return fail(res, "Missing tmdbId", 400);
        const data = await scrapeMovie(tmdbId);
        if (data.m3u8.length > 0) {
          // count as a view only when at least one stream is found
          if (req.apiKey) await incrementView(req.apiKey, 1);
        }
        return ok(res, { m3u8: data.m3u8, subtitles: data.subtitles });
      } catch (e: any) {
        return fail(res, e?.message || "Scrape failed", 500);
      }
    }
  );

  // TV Episode
  r.get(
    "/tv/:tmdbId/:season/:episode",
    authMiddleware,
    rateLimitMiddleware,
    async (req, res) => {
      try {
        const { tmdbId } = req.params;
        const season = Number(req.params.season);
        const episode = Number(req.params.episode);
        if (!tmdbId || !Number.isFinite(season) || !Number.isFinite(episode)) {
          return fail(res, "Invalid parameters", 400);
        }
        const data = await scrapeEpisode(tmdbId, season, episode);
        if (data.m3u8.length > 0) {
          if (req.apiKey) await incrementView(req.apiKey, 1);
        }
        return ok(res, { m3u8: data.m3u8, subtitles: data.subtitles });
      } catch (e: any) {
        return fail(res, e?.message || "Scrape failed", 500);
      }
    }
  );

  // Usage stats for current key (simple self-check)
  r.get("/me/usage", authMiddleware, async (req, res) => {
    try {
      // lightweight endpoint; count not required here
      // Import getViews lazily to avoid circular imports
      const { getViews } = await import("../services/usage.js");
      const count = req.apiKey ? await getViews(req.apiKey) : 0;
      return ok(res, { viewsToday: count, perThousandBlocks: count / 1000 });
    } catch (e: any) {
      return fail(res, e?.message || "Failed to fetch usage", 500);
    }
  });

  return r;
}
