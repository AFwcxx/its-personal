import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/connection.js";
import { getSession, insertSession, invalidateSession, touchSession } from "../db/repositories.js";

export interface SessionClaims {
  sessionId: string;
  deviceId: string;
}

export function verifyPassword(config: AppConfig, input: string): boolean {
  return input === config.APP_PASSWORD;
}

export function passwordFingerprint(config: AppConfig): string {
  return createHash("sha256").update(`${config.SESSION_SECRET}:${config.APP_PASSWORD}`).digest("hex");
}

export function issueSession(config: AppConfig, db: Db, deviceId: string, now = new Date()): { token: string; idleTimeoutSeconds: number } {
  const sessionId = nanoid();
  const timestamp = now.toISOString();
  insertSession(db, {
    id: sessionId,
    device_id: deviceId,
    password_fingerprint: passwordFingerprint(config),
    created_at: timestamp,
    last_seen_at: timestamp,
    invalidated_at: null
  });
  const token = jwt.sign({ sessionId, deviceId }, config.SESSION_SECRET);
  return { token, idleTimeoutSeconds: config.SESSION_IDLE_TIMEOUT_SECONDS };
}

export function verifySession(config: AppConfig, db: Db, token: string, now = new Date(), touch = true): SessionClaims {
  const decoded = jwt.verify(token, config.SESSION_SECRET) as SessionClaims;
  if (!decoded.sessionId || !decoded.deviceId) throw new Error("Invalid session token");
  const session = getSession(db, decoded.sessionId);
  if (!session || session.invalidated_at) throw new Error("Session expired");
  if (session.device_id !== decoded.deviceId) throw new Error("Invalid session token");
  if (session.password_fingerprint !== passwordFingerprint(config)) throw new Error("Session expired");
  const idleMs = config.SESSION_IDLE_TIMEOUT_SECONDS * 1000;
  if (Date.parse(session.last_seen_at) + idleMs <= now.getTime()) throw new Error("Session expired");
  if (touch) touchSession(db, decoded.sessionId, now.toISOString());
  return { sessionId: decoded.sessionId, deviceId: decoded.deviceId };
}

export function endSession(config: AppConfig, db: Db, token: string, now = new Date()): void {
  const decoded = jwt.verify(token, config.SESSION_SECRET) as SessionClaims;
  if (decoded.sessionId) invalidateSession(db, decoded.sessionId, now.toISOString());
}
