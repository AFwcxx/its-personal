import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/connection.js";
import { authRequired } from "./middleware/authRequired.js";
import { createPlannerChanges } from "./plannerChanges.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { authRouter } from "./routes/auth.js";
import { configRouter } from "./routes/config.js";
import { healthRouter } from "./routes/health.js";
import { plannerRouter } from "./routes/planner.js";

export function createServer(config: AppConfig, db: Db) {
  const app = express();
  const plannerChanges = createPlannerChanges();
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  app.use("/api/health", healthRouter());
  app.use("/api/config", configRouter(config));
  app.use("/api/auth", authRouter(config, db));
  app.use("/api/planner", authRequired(config, db), plannerRouter(db, config.APP_TIMEZONE, plannerChanges));
  app.use("/api/attachments", authRequired(config, db), attachmentsRouter(config, db, plannerChanges));
  app.get("/manifest.webmanifest", (_req, res) => {
    res.json({
      name: config.APP_TITLE,
      short_name: "Planner",
      start_url: "/",
      display: "standalone",
      background_color: "#070710",
      theme_color: "#070710",
      icons: []
    });
  });

  const webDist = path.resolve(process.cwd(), "apps/web/dist");
  app.use(express.static(webDist));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  return app;
}
