import { Router } from "express";
import type { AppConfig } from "../config.js";

export function configRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ appTitle: config.APP_TITLE, appTheme: config.APP_THEME });
  });

  return router;
}
