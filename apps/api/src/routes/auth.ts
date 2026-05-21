import { Router } from "express";
import { endSession, issueSession, verifyPassword, verifySession } from "../auth/session.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/connection.js";

export function authRouter(config: AppConfig, db: Db): Router {
  const router = Router();
  router.post("/unlock", (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : "unknown-device";
    if (!verifyPassword(config, password)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    res.json(issueSession(config, db, deviceId));
  });
  router.post("/activity", (req, res) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      verifySession(config, db, token);
      res.json({ ok: true, idleTimeoutSeconds: config.SESSION_IDLE_TIMEOUT_SECONDS });
    } catch {
      res.status(401).json({ error: "Session expired" });
    }
  });
  router.post("/lock", (req, res) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) {
      try {
        endSession(config, db, token);
      } catch {
        // Already invalid tokens still produce an idempotent local lock response.
      }
    }
    res.status(204).end();
  });
  return router;
}
