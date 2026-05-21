import { describe, expect, it } from "vitest";
import { cachedSnapshot } from "../services/api.js";

describe("offline snapshot cache", () => {
  it("returns last planner snapshot for read-only offline use", () => {
    localStorage.setItem("its-personal-last-snapshot", JSON.stringify({ tasks: [], tags: [], links: [], attachments: [] }));
    expect(cachedSnapshot()).toEqual({ tasks: [], tags: [], links: [], attachments: [] });
  });
});
