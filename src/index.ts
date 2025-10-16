import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import puppeteer from "puppeteer";

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
const PER_PROVIDER_MAX_MS = 45_000;

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

// Real scraping logic using Puppeteer: capture network requests for HLS (.m3u8) and subtitles (.vtt/.srt)
async function scrapeProviderWithSubtitles(
  targetUrl: string
): Promise<{ urls: string[]; subtitles: Subtitle[] }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  });
  const page = await browser.newPage();

  const foundM3U8 = new Set<string>();
  const foundSubs = new Map<string, Subtitle>();

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
        waitUntil: "networkidle2",
        timeout: PER_PROVIDER_MAX_MS,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

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
    await browser.close().catch(() => {});
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
    const race = Promise.race<{
      urls: string[];
      subtitles: Subtitle[];
    }>([
      scrapeProviderWithSubtitles(targetUrl),
      new Promise<{ urls: string[]; subtitles: Subtitle[] }>((r) =>
        setTimeout(() => r({ urls: [], subtitles: [] }), PER_PROVIDER_MAX_MS)
      ),
    ]);
    const { urls, subtitles } = await race;
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
    const race = Promise.race<{
      urls: string[];
      subtitles: Subtitle[];
    }>([
      scrapeProviderWithSubtitles(targetUrl),
      new Promise<{ urls: string[]; subtitles: Subtitle[] }>((r) =>
        setTimeout(() => r({ urls: [], subtitles: [] }), PER_PROVIDER_MAX_MS)
      ),
    ]);
    const { urls, subtitles } = await race;
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
    const data = await scrapeMovie(tmdbId);
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
    const data = await scrapeEpisode(tmdbId, season, episode);
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
