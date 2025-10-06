import dotenv from "dotenv";
dotenv.config();

const rawApiKeys = (
  process.env.API_KEYS ||
  process.env.API_KEY ||
  process.env.API_TOKEN ||
  ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const apiKeys = new Set<string>(rawApiKeys);

const rawOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const corsOrigins = new Set<string>(rawOrigins);

export const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 60);
export const RATE_LIMIT_BURST = Number(process.env.RATE_LIMIT_BURST || 100);

export const DATABASE_URL = process.env.DATABASE_URL || "";

export const NODE_ENV = process.env.NODE_ENV || "development";

export const isDev = NODE_ENV !== "production";
