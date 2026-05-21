import jwt from "jsonwebtoken";
import type { AppConfig } from "../config.js";

export interface SessionClaims {
  deviceId: string;
}

export function verifyPassword(config: AppConfig, input: string): boolean {
  return input === config.APP_PASSWORD;
}

export function nextLocalDayBoundary(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const noonNextDayUtc = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const offsetMinutes = timezoneOffsetMinutes(noonNextDayUtc, timezone);
  return new Date(Date.UTC(year, month - 1, day + 1, 0) - offsetMinutes * 60_000);
}

export function issueSession(config: AppConfig, deviceId: string, now = new Date()): { token: string; expiresAt: string } {
  const expires = nextLocalDayBoundary(now, config.APP_TIMEZONE);
  const token = jwt.sign({ deviceId }, config.SESSION_SECRET, { expiresIn: Math.max(1, Math.floor((expires.getTime() - now.getTime()) / 1000)) });
  return { token, expiresAt: expires.toISOString() };
}

export function verifySession(config: AppConfig, token: string): SessionClaims {
  const decoded = jwt.verify(token, config.SESSION_SECRET) as SessionClaims;
  return { deviceId: decoded.deviceId };
}

function timezoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return (asUtc - date.getTime()) / 60_000;
}
