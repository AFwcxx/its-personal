import type { NextFunction, Request, Response } from "express";
import { verifySession } from "../auth/session.js";
import type { AppConfig } from "../config.js";

export function authRequired(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      res.locals.session = verifySession(config, token);
      next();
    } catch {
      res.status(401).json({ error: "Session expired" });
    }
  };
}
