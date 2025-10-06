import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./swagger.js";
import { buildRouter } from "./routes/index.js";
import { corsOrigins, apiKeys, RATE_LIMIT_PER_MIN, RATE_LIMIT_BURST, } from "./utils/config.js";
// Load environment variables
dotenv.config();
const app = express();
// Security headers
app.use(helmet());
// CORS: allow only trusted origins
app.use(cors({
    origin: (origin, cb) => {
        if (!origin)
            return cb(null, true); // allow same-origin / server-to-server
        if (corsOrigins.has("*"))
            return cb(null, true);
        if (corsOrigins.has(origin))
            return cb(null, true);
        return cb(new Error("CORS not allowed"));
    },
    credentials: true,
}));
// Health and docs
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get("/openapi.json", (_req, res) => res.json(openapiSpec));
// API routes (auth, rate limit, tracking inside)
app.use("/", buildRouter());
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
    const origins = Array.from(corsOrigins).join(", ") || "(none)";
    console.log(`[config] api keys: ${apiKeys.size}, cors origins: ${origins}, rate-limit: ${RATE_LIMIT_PER_MIN}/min (burst ${RATE_LIMIT_BURST})`);
    console.log(`Express API listening on http://localhost:${PORT}`);
});
