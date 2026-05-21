import { describe, expect, it } from "vitest";
import { nextDueDate, normalizeRecurrence } from "../src/recurrence.js";

describe("nextDueDate", () => {
  it("supports documented recurrence types", () => {
    expect(nextDueDate("2026-05-20", { type: "daily", ends: { type: "eternity" } })).toBe("2026-05-21");
    expect(nextDueDate("2026-05-20", { type: "weekly", ends: { type: "eternity" } })).toBe("2026-05-27");
    expect(nextDueDate("2026-05-20", { type: "monthly", ends: { type: "eternity" } })).toBe("2026-06-20");
    expect(nextDueDate("2026-05-20", { type: "yearly", ends: { type: "eternity" } })).toBe("2027-05-20");
    expect(nextDueDate("2026-05-20", { type: "every_n_days", intervalDays: 9, ends: { type: "eternity" } })).toBe("2026-05-29");
  });

  it("clamps monthly dates", () => {
    expect(nextDueDate("2026-01-31", { type: "monthly", ends: { type: "eternity" } })).toBe("2026-02-28");
  });

  it("treats recurrence end dates as inclusive", () => {
    expect(nextDueDate("2026-05-20", { type: "daily", ends: { type: "date", date: "2026-05-21" } })).toBe("2026-05-21");
    expect(nextDueDate("2026-05-20", { type: "daily", ends: { type: "date", date: "2026-05-20" } })).toBeNull();
  });

  it("applies recurrence end dates after monthly clamping", () => {
    expect(nextDueDate("2026-01-31", { type: "monthly", ends: { type: "date", date: "2026-02-28" } })).toBe("2026-02-28");
    expect(nextDueDate("2026-01-31", { type: "monthly", ends: { type: "date", date: "2026-02-27" } })).toBeNull();
  });

  it("normalizes old recurring shapes to eternity", () => {
    expect(normalizeRecurrence({ type: "weekly" })).toEqual({ type: "weekly", ends: { type: "eternity" } });
    expect(normalizeRecurrence({ type: "every_n_days", intervalDays: 9 })).toEqual({
      type: "every_n_days",
      intervalDays: 9,
      ends: { type: "eternity" }
    });
  });
});
