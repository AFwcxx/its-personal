import { MAIN_NAVIGATION_IDS, mainNavigationOrderSchema } from "@its-personal/shared";
import { Router } from "express";
import type { Db } from "../db/connection.js";
import { getAppSetting, setAppSetting } from "../db/repositories.js";

const navigationSettingKey = "main-navigation-order";

export function settingsRouter(db: Db): Router {
  const router = Router();

  router.get("/main-navigation", (_req, res) => {
    const raw = getAppSetting(db, navigationSettingKey);
    if (!raw) {
      res.json({ orderedIds: [...MAIN_NAVIGATION_IDS] });
      return;
    }
    try {
      const parsed = mainNavigationOrderSchema.safeParse(JSON.parse(raw));
      res.json({ orderedIds: parsed.success ? parsed.data : [...MAIN_NAVIGATION_IDS] });
    } catch {
      res.json({ orderedIds: [...MAIN_NAVIGATION_IDS] });
    }
  });

  router.put("/main-navigation", (req, res) => {
    const parsed = mainNavigationOrderSchema.safeParse(req.body?.orderedIds);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid main navigation order", issues: parsed.error.issues });
      return;
    }
    setAppSetting(db, navigationSettingKey, JSON.stringify(parsed.data));
    res.json({ orderedIds: parsed.data });
  });

  return router;
}
