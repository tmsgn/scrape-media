import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import axios from "axios";

// Load environment variables
dotenv.config();

// Create app
const app = express();

// Minimal CORS: allow all origins (no credentials)
app.use(cors());

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Types shared by endpoints
type Subtitle = {
  url: string;
  label?: string;
  lang?: string;
  langCode?: string; // ISO 639-1
};

// Helpers: uniform responses
function ok<T>(res: import("express").Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}
function fail(res: import("express").Response, error: string, status = 400) {
  return res.status(status).json({ success: false, error });
}

// Scraper plumbing (minimal inline version)
// In your original project, these referenced providers/scraper modules.
// Here, we expose the same contract with placeholder logic you can replace.
const PER_PROVIDER_MAX_MS = 25_000; // tighter budget per provider
const NETWORK_SETTLE_MS = 1_000; // quiet period before finishing after first hit
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60_000); // default 10m
const ENABLE_CACHE =
  (process.env.ENABLE_CACHE || "true").toLowerCase() !== "false";

type Provider = {
  name: string;
  idType: "tmdb";
  url: (opts: {
    type: "movie" | "show";
    id: string;
    season?: number;
    episode?: number;
  }) => string;
};

type ScrapeOut = {
  m3u8: string[];
  subtitles: Subtitle[];
  firstProvider: string | null;
};

// Provider list
const providers: Provider[] = [
  {
    name: "Vidrock",
    idType: "tmdb",
    url: ({ type, id, season, episode }) =>
      type === "movie"
        ? `https://vidrock.net/movie/${id}`
        : `https://vidrock.net/tv/${id}/${season}/${episode}`,
  },
];

// Simple in-memory cache
type CacheEntry<T> = { expiresAt: number; data: T };
const memoryCache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  if (!ENABLE_CACHE) return null;
  const e = memoryCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return e.data as T;
}

function cacheSet<T>(key: string, data: T, ttlMs = CACHE_TTL_MS) {
  if (!ENABLE_CACHE) return;
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Shared Puppeteer browser (singleton) for speed
let browserPromise: Promise<puppeteer.Browser> | null = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
      ],
    });
  }
  return browserPromise;
}

// Fast HTTP pre-scan using axios (no headless browser). Helps many providers.
async function httpPreScan(
  targetUrl: string
): Promise<{ urls: string[]; subtitles: Subtitle[] }> {
  try {
    const res = await axios.get<string>(targetUrl, {
      timeout: Math.min(10_000, PER_PROVIDER_MAX_MS / 2),
      responseType: "text",
      // Some providers block default UA; use a common one
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 3,
      validateStatus: () => true,
    });
    const html = res.data || "";
    const m3u8Regex = /https?:[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
    const subRegex = /https?:[^\s"'<>]+\.(vtt|srt)(?:\?[^\s"'<>]*)?/gi;
    const urls = Array.from(new Set(html.match(m3u8Regex) || []));
    const subs = Array.from(new Set(html.match(subRegex) || [])).map(
      (u) => ({ url: u } as Subtitle)
    );
    return { urls, subtitles: subs };
  } catch {
    return { urls: [], subtitles: [] };
  }
}

// Real scraping logic using Puppeteer: capture network requests for HLS (.m3u8) and subtitles (.vtt/.srt)
async function scrapeProviderWithSubtitles(
  targetUrl: string
): Promise<{ urls: string[]; subtitles: Subtitle[] }> {
  const browser = await getBrowser();
  const context = await (browser as any).createBrowserContext();
  const page = await context.newPage();

  const foundM3U8 = new Set<string>();
  const foundSubs = new Map<string, Subtitle>();
  let firstHitAt: number | null = null;

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (type === "image" || type === "font" || type === "stylesheet") {
      return req.abort();
    }
    return req.continue();
  });

  page.on("response", async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers()["content-type"] || "").toLowerCase();
      if (
        url.includes(".m3u8") ||
        ct.includes("application/vnd.apple.mpegurl") ||
        ct.includes("application/x-mpegurl")
      ) {
        foundM3U8.add(url);
        if (!firstHitAt) firstHitAt = Date.now();
      }
      if (
        url.match(/\.(vtt|srt)(\?|$)/i) ||
        ct.includes("text/vtt") ||
        ct.includes("application/x-subrip")
      ) {
        foundSubs.set(url, {
          url,
          label: undefined,
          lang: undefined,
          langCode: undefined,
        });
      }
    } catch {}
  });

  try {
    await page
      .goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: PER_PROVIDER_MAX_MS,
      })
      .catch(() => {});

    // Short observation loop: either quiet period after first hit, or overall timeout
    const start = Date.now();
    while (Date.now() - start < PER_PROVIDER_MAX_MS) {
      // If we got a hit, wait for a brief settle time to collect variants then break
      if (firstHitAt && Date.now() - firstHitAt >= NETWORK_SETTLE_MS) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    // DOM fallback scan
    const html = await page.content();
    const m3u8Regex = /https?:[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
    const subRegex = /https?:[^\s"'<>]+\.(vtt|srt)(?:\?[^\s"'<>]*)?/gi;
    (html.match(m3u8Regex) || []).forEach((u) => foundM3U8.add(u));
    (html.match(subRegex) || []).forEach((u) => foundSubs.set(u, { url: u }));

    // Probe <video> tags
    const dom = await page.evaluate(() => {
      const urls: string[] = [];
      const subs: string[] = [];
      document
        .querySelectorAll<HTMLSourceElement>("video source")
        .forEach((s) => s.src && urls.push(s.src));
      document
        .querySelectorAll<HTMLTrackElement>(
          "video track[kind='subtitles'], track[kind='captions']"
        )
        .forEach((t) => (t as any).src && subs.push((t as any).src));
      return { urls, subs };
    });
    dom.urls.forEach((u) => /\.m3u8(\?|$)/i.test(u) && foundM3U8.add(u));
    dom.subs.forEach((u) => foundSubs.set(u, { url: u }));

    return {
      urls: Array.from(foundM3U8),
      subtitles: Array.from(foundSubs.values()),
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function scrapeMovie(tmdbId: string) {
  const matched = providers.filter((p) => p.idType === "tmdb");
  if (matched.length === 0)
    return { m3u8: [], subtitles: [], firstProvider: null } as const;

  const found = new Set<string>();
  const subFound = new Map<string, Subtitle>();
  let firstProvider: string | null = null;

  for (const p of matched) {
    const targetUrl = p.url({ type: "movie", id: tmdbId });
    // Fast pre-scan
    const pre = await httpPreScan(targetUrl);
    let urls = pre.urls;
    let subtitles = pre.subtitles;
    // If pre-scan fails to find, fall back to Puppeteer (bounded time)
    if (urls.length === 0) {
      const race = Promise.race<{
        urls: string[];
        subtitles: Subtitle[];
      }>([
        scrapeProviderWithSubtitles(targetUrl),
        new Promise<{ urls: string[]; subtitles: Subtitle[] }>((r) =>
          setTimeout(() => r({ urls: [], subtitles: [] }), PER_PROVIDER_MAX_MS)
        ),
      ]);
      ({ urls, subtitles } = await race);
    }
    urls.forEach((u) => found.add(u));
    subtitles.forEach((s) => subFound.set(s.url, s));
    if (found.size > 0) {
      firstProvider = p.name;
      break;
    }
  }

  return {
    m3u8: Array.from(found),
    subtitles: Array.from(subFound.values()),
    firstProvider,
  } as const;
}

async function scrapeEpisode(tmdbId: string, season: number, episode: number) {
  const matched = providers.filter((p) => p.idType === "tmdb");
  if (matched.length === 0)
    return { m3u8: [], subtitles: [], firstProvider: null } as const;

  const found = new Set<string>();
  const subFound = new Map<string, Subtitle>();
  let firstProvider: string | null = null;

  for (const p of matched) {
    const targetUrl = p.url({ type: "show", id: tmdbId, season, episode });
    // Fast pre-scan
    const pre = await httpPreScan(targetUrl);
    let urls = pre.urls;
    let subtitles = pre.subtitles;
    if (urls.length === 0) {
      const race = Promise.race<{
        urls: string[];
        subtitles: Subtitle[];
      }>([
        scrapeProviderWithSubtitles(targetUrl),
        new Promise<{ urls: string[]; subtitles: Subtitle[] }>((r) =>
          setTimeout(() => r({ urls: [], subtitles: [] }), PER_PROVIDER_MAX_MS)
        ),
      ]);
      ({ urls, subtitles } = await race);
    }
    urls.forEach((u) => found.add(u));
    subtitles.forEach((s) => subFound.set(s.url, s));
    if (found.size > 0) {
      firstProvider = p.name;
      break;
    }
  }

  return {
    m3u8: Array.from(found),
    subtitles: Array.from(subFound.values()),
    firstProvider,
  } as const;
}

// Routes (no auth, no rate limit)
app.get("/movie/:tmdbId", async (req, res) => {
  try {
    const tmdbId = req.params.tmdbId;
    if (!tmdbId) return fail(res, "Missing tmdbId", 400);
    const cacheKey = `movie:${tmdbId}`;
    const skipCache = String(
      (req.query.skipCache ?? req.query.noCache) || "false"
    ).toLowerCase();
    const useCache = !(skipCache === "1" || skipCache === "true");
    const cached = useCache ? cacheGet<ScrapeOut>(cacheKey) : null;
    if (cached)
      return ok(res, {
        m3u8: cached.m3u8,
        subtitles: cached.subtitles,
        provider: cached.firstProvider ?? null,
      });
    const data = await scrapeMovie(tmdbId);
    cacheSet(cacheKey, data);
    return ok(res, {
      m3u8: data.m3u8,
      subtitles: data.subtitles,
      provider: data.firstProvider ?? null,
    });
  } catch (e: any) {
    return fail(res, e?.message || "Scrape failed", 500);
  }
});

app.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const season = Number(req.params.season);
    const episode = Number(req.params.episode);
    if (!tmdbId || !Number.isFinite(season) || !Number.isFinite(episode)) {
      return fail(res, "Invalid parameters", 400);
    }
    const cacheKey = `tv:${tmdbId}:${season}:${episode}`;
    const skipCache = String(
      (req.query.skipCache ?? req.query.noCache) || "false"
    ).toLowerCase();
    const useCache = !(skipCache === "1" || skipCache === "true");
    const cached = useCache ? cacheGet<ScrapeOut>(cacheKey) : null;
    if (cached)
      return ok(res, {
        m3u8: cached.m3u8,
        subtitles: cached.subtitles,
        provider: cached.firstProvider ?? null,
      });
    const data = await scrapeEpisode(tmdbId, season, episode);
    cacheSet(cacheKey, data);
    return ok(res, {
      m3u8: data.m3u8,
      subtitles: data.subtitles,
      provider: data.firstProvider ?? null,
    });
  } catch (e: any) {
    return fail(res, e?.message || "Scrape failed", 500);
  }
});

// Start server
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
  console.log(`Express API listening on http://localhost:${PORT}`);
});
