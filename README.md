# Scraper Express API (Rental-ready)

Express API that scrapes streaming sources (M3U8) and subtitles from multiple providers, with Bearer API key auth, rate limiting, usage tracking, and Vercel serverless compatibility.

## Setup

1. Install dependencies
2. Copy environment file
   - Copy `.env.example` to `.env`
   - Set `API_KEYS` to one or more keys (comma-separated)
3. Run in dev (hot reload)

The server launches on http://localhost:8080 by default (configurable via `PORT`).

Swagger UI: `http://localhost:8080/docs`
OpenAPI JSON: `http://localhost:8080/openapi.json`

## Security: Bearer API Key

- Use `Authorization: Bearer <your-api-key>`
- Allow-list CORS origins via `CORS_ORIGINS`.
- Helmet is enabled for security headers.

PowerShell example:

```powershell
$Headers = @{ 'Authorization' = 'Bearer key1' }
curl -Method GET -Headers $Headers "http://localhost:8080/movie/597"
```

## Endpoints

- GET `/health` — health check
- GET `/movie/:tmdbId` — scrape movie
- GET `/tv/:tmdbId/:season/:episode` — scrape episode
- GET `/me/usage` — views today for your API key

## Response shape

Success:

```
{ "success": true, "data": { "m3u8": string[], "subtitles": { url: string, label?: string, lang?: string, langCode?: string }[] } }
```

Error:

```
{ "success": false, "error": string }
```

## Rate limiting

Token-bucket per API key. Configure `RATE_LIMIT_PER_MIN` and `RATE_LIMIT_BURST`.

## Usage tracking

- Increments a view when at least one stream is found.
- Uses Vercel Postgres if `DATABASE_URL` is set; otherwise falls back to in-memory.
- Billing can be computed per 1000 views using the stored counts.

## Deployment to Vercel

This repo includes serverless function handlers under `api/`.

1. Push to GitHub and import into Vercel
2. Set environment variables: `API_KEYS`, `CORS_ORIGINS`, `RATE_LIMIT_PER_MIN`, `RATE_LIMIT_BURST`, `DATABASE_URL`
3. Use endpoints like `/api/movie/597` and `/api/tv/1396/1/1`

## Notes

- Puppeteer is used to detect network requests. Some providers may change their structure.
- Network interception aborts heavy resources to make scraping faster.
- A per-provider timeout stops waiting after 45s.
