# Scraper Express API

A minimal Express API exposing scraping endpoints that return discovered .m3u8 URLs and subtitles.

## Setup

1. Install dependencies
2. Copy environment file
   - Copy `.env.example` to `.env`
   - Set `API_TOKEN` to a secret value
3. Run in dev (hot reload)

The server launches on http://localhost:8080 by default (configurable via `PORT`).

## Security: API token header

All scraping endpoints require a header named `API-TOKEN` to match the `API_TOKEN` in your `.env` file. The `/health` endpoint is public.

PowerShell examples:

```powershell
# Without token (should return 401)
curl -Method GET "http://localhost:8080/movie/12345"

# With token
$Headers = @{ 'API-TOKEN' = 'change-me' }
curl -Method GET -Headers $Headers "http://localhost:8080/movie/12345"
```

Swagger UI is available when the server is running at `http://localhost:8080/docs`.
The raw OpenAPI JSON is available at `http://localhost:8080/openapi.json`.
Protected endpoints require the `API-TOKEN` header. Set `API_TOKEN` in `.env` and send the same value in requests.

Example request (Thunder Client/Postman):

- Method: GET
- URL: `http://localhost:8080/movie/597`
- Headers: `API-TOKEN: <your-token>`

## Endpoints

- GET `/health` — health check
- GET `/movie/:tmdbId` — scrape movie embeds using TMDB id
- GET `/tv/:tmdbId/:season/:episode` — scrape show episode embeds using TMDB id

Response JSON shape:

```
{ "urls": string[], "subtitles": { url: string, label?: string, lang?: string, langCode?: string }[], "firstProvider"?: string, "error"?: string }
```

## Notes

- Uses headless Chromium via Puppeteer. Some providers may block or rate limit.
- Network interception aborts heavy resources to make scraping faster.
- A per-provider timeout stops waiting after 45s.
