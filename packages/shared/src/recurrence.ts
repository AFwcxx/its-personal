import { addDays, parseDate, toDateString } from "./dates.js";
import type { Recurrence, RecurrenceEnd } from "./types.js";

const eternity: RecurrenceEnd = { type: "eternity" };

export function nextDueDate(date: string, recurrence: Recurrence, recurrenceDate = date): string | null {
  const normalized = normalizeRecurrence(recurrence);
  let next = recurrenceDate;
  switch (normalized.type) {
    case "none":
      return null;
    case "daily":
      while (next <= date) next = addDays(next, 1);
      break;
    case "weekly":
      while (next <= date) next = addDays(next, 7);
      break;
    case "every_n_days":
      while (next <= date) next = addDays(next, normalized.intervalDays);
      break;
    case "monthly":
      next = nextMonthDate(date, recurrenceDate);
      break;
    case "yearly":
      next = nextYearDate(date, recurrenceDate);
      break;
  }
  return withinRecurrenceEnd(date, next, normalized.ends) ? next : null;
}

function nextMonthDate(after: string, anchor: string): string {
  const base = parseDate(anchor);
  const target = parseDate(after);
  let months = (target.getUTCFullYear() - base.getUTCFullYear()) * 12 + target.getUTCMonth() - base.getUTCMonth();
  let next = addMonths(anchor, Math.max(0, months));
  if (next <= after) next = addMonths(anchor, Math.max(0, months) + 1);
  return next;
}

function nextYearDate(after: string, anchor: string): string {
  const years = Math.max(0, parseDate(after).getUTCFullYear() - parseDate(anchor).getUTCFullYear());
  const next = addYears(anchor, years);
  return next > after ? next : addYears(anchor, years + 1);
}

export function normalizeRecurrence(value: unknown): Recurrence {
  if (!value || typeof value !== "object") return { type: "none" };
  const recurrence = value as { type?: unknown; intervalDays?: unknown; ends?: unknown };
  switch (recurrence.type) {
    case "daily":
    case "weekly":
    case "monthly":
    case "yearly":
      return { type: recurrence.type, ends: normalizeRecurrenceEnd(recurrence.ends) };
    case "every_n_days":
      return {
        type: "every_n_days",
        intervalDays: normalizeIntervalDays(recurrence.intervalDays),
        ends: normalizeRecurrenceEnd(recurrence.ends)
      };
    default:
      return { type: "none" };
  }
}

export function recurrenceEndsBeforeDueDate(dueDate: string, recurrence: Recurrence): boolean {
  const normalized = normalizeRecurrence(recurrence);
  return normalized.type !== "none" && normalized.ends.type === "date" && normalized.ends.date < dueDate;
}

function normalizeRecurrenceEnd(value: unknown): RecurrenceEnd {
  if (!value || typeof value !== "object") return eternity;
  const end = value as { type?: unknown; date?: unknown };
  if (end.type === "date" && typeof end.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(end.date)) {
    return { type: "date", date: end.date };
  }
  return eternity;
}

function normalizeIntervalDays(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3660 ? value : 1;
}

function withinRecurrenceEnd(current: string, next: string, ends: RecurrenceEnd): boolean {
  if (ends.type === "eternity") return true;
  if (ends.date < current) return false;
  return next <= ends.date;
}

function addMonths(date: string, months: number): string {
  const parsed = parseDate(date);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + months;
  const day = parsed.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

function addYears(date: string, years: number): string {
  const parsed = parseDate(date);
  const year = parsed.getUTCFullYear() + years;
  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}
