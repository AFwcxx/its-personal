import { describe, expect, it } from "vitest";
import { nextDueDate } from "../src/recurrence.js";

describe("nextDueDate", () => {
  it("supports documented recurrence types", () => {
    expect(nextDueDate("2026-05-20", { type: "daily" })).toBe("2026-05-21");
    expect(nextDueDate("2026-05-20", { type: "weekly" })).toBe("2026-05-27");
    expect(nextDueDate("2026-05-20", { type: "monthly" })).toBe("2026-06-20");
    expect(nextDueDate("2026-05-20", { type: "yearly" })).toBe("2027-05-20");
    expect(nextDueDate("2026-05-20", { type: "every_n_days", intervalDays: 9 })).toBe("2026-05-29");
  });

  it("clamps monthly dates", () => {
    expect(nextDueDate("2026-01-31", { type: "monthly" })).toBe("2026-02-28");
  });
});
