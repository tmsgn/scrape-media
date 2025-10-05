export type IdType = "tmdb" | "imdb";
export type MediaType = "movie" | "show";

export interface Subtitle {
  url: string;
  label?: string;
  lang?: string;
  // ISO 639-1 language code, e.g. "en", "es"
  langCode?: string;
}

export interface ScrapeResult {
  urls: string[];
  subtitles: Subtitle[];
  firstProvider?: string | null;
  error?: string;
}
