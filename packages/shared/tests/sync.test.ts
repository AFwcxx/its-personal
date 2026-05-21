import { describe, expect, it } from "vitest";
import { chooseFieldWinner } from "../src/sync.js";

describe("chooseFieldWinner", () => {
  it("uses newer modifiedAt", () => {
    expect(chooseFieldWinner({ value: "old", modifiedAt: "2026-05-20T00:00:00.000Z", deviceId: "b" }, { value: "new", modifiedAt: "2026-05-20T01:00:00.000Z", deviceId: "a" }).value).toBe("new");
  });

  it("ties by device id", () => {
    expect(chooseFieldWinner({ value: "a", modifiedAt: "2026-05-20T00:00:00.000Z", deviceId: "a" }, { value: "b", modifiedAt: "2026-05-20T00:00:00.000Z", deviceId: "b" }).value).toBe("b");
  });
});
