import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/connection.js";
import { authRequired } from "./middleware/authRequired.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { plannerRouter } from "./routes/planner.js";

export function createServer(config: AppConfig, db: Db) {
  const app = express();
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/health", healthRouter());
  app.use("/api/auth", authRouter(config));
  app.use("/api/planner", authRequired(config), plannerRouter(db, config.APP_TIMEZONE));
  app.use("/api/attachments", authRequired(config), attachmentsRouter(config, db));

  const webDist = path.resolve(process.cwd(), "apps/web/dist");
  app.use(express.static(webDist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  return app;
}
