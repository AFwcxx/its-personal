import { addDays, parseDate, toDateString } from "./dates.js";
import type { Recurrence } from "./types.js";

export function nextDueDate(date: string, recurrence: Recurrence): string | null {
  switch (recurrence.type) {
    case "none":
      return null;
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "every_n_days":
      return addDays(date, recurrence.intervalDays);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addYears(date, 1);
  }
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
