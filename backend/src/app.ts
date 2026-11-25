import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { verifyAccessToken } from "./lib/jwt.js";
import { isAdminUser } from "./lib/roles.js";

import { errorHandler, notFound } from "./middleware/error.js";
import { createApiRouter, type ApiDeps } from "./routes/index.js";

// Dependencies are injectable so tests can run without a live Supabase project.
export function createApp(deps: ApiDeps = { verifyToken: verifyAccessToken, isAdmin: isAdminUser }) {
  const app = express();
  app.disable("x-powered-by");
  // Render/Vercel sit behind one proxy hop; needed for correct client IPs in rate limiting.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      level: env.LOG_LEVEL,
      // Skip the container healthcheck so it doesn't flood the logs.
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
      redact: ["req.headers.authorization", "req.headers.cookie"],
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (no Origin header) and allowlisted origins only.
        cb(null, !origin || env.corsOrigins.includes(origin));
      },
    }),
  );
  app.use(rateLimit({ windowMs: 60_000, limit: env.RATE_LIMIT_MAX, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1", createApiRouter(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

