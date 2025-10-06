import { DATABASE_URL, isDev } from "../utils/config.js";
import { createPool } from "@vercel/postgres";

type ViewRow = {
  api_key: string;
  date: string; // YYYY-MM-DD
  count: number;
};

// In-memory fallback store
const memViews = new Map<string, number>(); // key: `${apiKey}:${yyyy-mm-dd}` -> count

const pool = DATABASE_URL
  ? createPool({ connectionString: DATABASE_URL })
  : null;

async function ensureSchema() {
  if (!pool) return;
  await pool.sql`CREATE TABLE IF NOT EXISTS api_usage (
    api_key TEXT NOT NULL,
    date DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key, date)
  );`;
}

ensureSchema().catch(() => {});

function today() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function incrementView(apiKey: string, by = 1) {
  const date = today();
  if (!pool) {
    const k = `${apiKey}:${date}`;
    memViews.set(k, (memViews.get(k) || 0) + by);
    return;
  }
  await pool.sql`INSERT INTO api_usage (api_key, date, count)
               VALUES (${apiKey}, ${date}, ${by})
               ON CONFLICT (api_key, date)
               DO UPDATE SET count = api_usage.count + EXCLUDED.count`;
}

export async function getViews(apiKey: string, dateStr?: string) {
  const date = dateStr || today();
  if (!pool) {
    const k = `${apiKey}:${date}`;
    return memViews.get(k) || 0;
  }
  const { rows } =
    await pool.sql<ViewRow>`SELECT api_key, to_char(date, 'YYYY-MM-DD') as date, count FROM api_usage WHERE api_key=${apiKey} AND date=${date}`;
  return rows[0]?.count || 0;
}

export type RateState = {
  tokens: number;
  lastRefill: number; // epoch ms
};

const memRate = new Map<string, RateState>();

export function getRateState(apiKey: string): RateState {
  let s = memRate.get(apiKey);
  if (!s) {
    s = { tokens: 0, lastRefill: Date.now() };
    memRate.set(apiKey, s);
  }
  return s;
}
