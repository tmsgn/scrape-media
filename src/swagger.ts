import swaggerJsdoc from "swagger-jsdoc";

// OpenAPI definition for the API
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Scraper Express API",
      version: "1.0.0",
      description:
        "Express API that scrapes streaming sources and subtitles. Secured with Bearer API key.",
    },
    servers: [{ url: "http://localhost:8080" }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Provide your API key as a Bearer token.",
        },
      },
      schemas: {
        EnvelopeSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [true] },
            data: { type: "object" },
          },
          required: ["success", "data"],
        },
        EnvelopeError: {
          type: "object",
          properties: {
            success: { type: "boolean", enum: [false] },
            error: { type: "string" },
          },
          required: ["success", "error"],
        },
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
            m3u8: { type: "array", items: { type: "string" } },
            subtitles: {
              type: "array",
              items: { $ref: "#/components/schemas/Subtitle" },
            },
            firstProvider: { type: "string", nullable: true },
          },
          required: ["m3u8", "subtitles"],
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
          security: [{ BearerAuth: [] }],
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
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/EnvelopeSuccess" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/ScrapeResult" },
                        },
                        required: ["data"],
                      },
                    ],
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
            "400": {
              description: "Invalid input",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
            "500": {
              description: "Scrape failed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
          },
        },
      },
      "/tv/{tmdbId}/{season}/{episode}": {
        get: {
          summary: "Scrape sources for a TV episode by TMDB id",
          security: [{ BearerAuth: [] }],
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
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/EnvelopeSuccess" },
                      {
                        type: "object",
                        properties: {
                          data: { $ref: "#/components/schemas/ScrapeResult" },
                        },
                        required: ["data"],
                      },
                    ],
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
            "400": {
              description: "Invalid season/episode",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
            "500": {
              description: "Scrape failed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EnvelopeError" },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [],
};

export const openapiSpec = swaggerJsdoc(options);
