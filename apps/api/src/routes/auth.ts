import { Router } from "express";
import { issueSession, verifyPassword } from "../auth/session.js";
import type { AppConfig } from "../config.js";

export function authRouter(config: AppConfig): Router {
  const router = Router();
  router.post("/unlock", (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId : "unknown-device";
    if (!verifyPassword(config, password)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    res.json(issueSession(config, deviceId));
  });
  return router;
}
