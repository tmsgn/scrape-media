import { providers, PER_PROVIDER_MAX_MS } from "../providers.js";
import { scrapeProviderWithSubtitles } from "../scraper.js";
import type { Subtitle } from "../types.js";

export async function scrapeMovie(tmdbId: string) {
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

export async function scrapeEpisode(
  tmdbId: string,
  season: number,
  episode: number
) {
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
