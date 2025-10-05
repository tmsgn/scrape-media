import swaggerJsdoc from "swagger-jsdoc";

// OpenAPI definition for the API
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Scraper Express API",
      version: "1.0.0",
      description:
        "Simple Express API that scrapes streaming sources and subtitles. Protected with an API-TOKEN header.",
    },
    servers: [{ url: "http://localhost:8080" }],
    components: {
      securitySchemes: {
        ApiToken: {
          type: "apiKey",
          in: "header",
          name: "API-TOKEN",
          description:
            "Provide the API token configured on the server via the API-TOKEN header.",
        },
      },
      schemas: {
        Subtitle: {
          type: "object",
          properties: {
            url: { type: "string" },
            label: { type: "string" },
            lang: { type: "string" },
            langCode: { type: "string", description: "ISO 639-1 code" },
          },
          required: ["url"],
        },
        ScrapeResult: {
          type: "object",
          properties: {
            urls: { type: "array", items: { type: "string" } },
            subtitles: {
              type: "array",
              items: { $ref: "#/components/schemas/Subtitle" },
            },
            firstProvider: { type: "string", nullable: true },
            error: { type: "string" },
          },
          required: ["urls", "subtitles"],
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                    required: ["ok"],
                  },
                },
              },
            },
          },
        },
      },
      "/movie/{tmdbId}": {
        get: {
          summary: "Scrape sources for a movie by TMDB id",
          security: [{ ApiToken: [] }],
          parameters: [
            {
              name: "tmdbId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "TMDB movie ID",
            },
          ],
          responses: {
            "200": {
              description: "Scrape result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ScrapeResult" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
            },
            "400": {
              description: "No providers for tmdb",
            },
            "500": { description: "Scrape failed" },
          },
        },
      },
      "/tv/{tmdbId}/{season}/{episode}": {
        get: {
          summary: "Scrape sources for a TV episode by TMDB id",
          security: [{ ApiToken: [] }],
          parameters: [
            {
              name: "tmdbId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "season",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
            {
              name: "episode",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            "200": {
              description: "Scrape result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ScrapeResult" },
                },
              },
            },
            "401": { description: "Unauthorized" },
            "400": {
              description: "Invalid season/episode or no providers for tmdb",
            },
            "500": { description: "Scrape failed" },
          },
        },
      },
    },
  },
  apis: [],
};

export const openapiSpec = swaggerJsdoc(options);
