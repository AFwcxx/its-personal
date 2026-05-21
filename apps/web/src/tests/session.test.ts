import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "../stores/session.js";

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps unlock state tab scoped and expires it after local idle timeout", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(12_001);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "token", idleTimeoutSeconds: 10 }), { status: 200 })));

    const session = useSessionStore();
    expect(await session.unlock("secret")).toBe(true);

    expect(sessionStorage.getItem("its-personal-token")).toBe("token");
    expect(localStorage.getItem("its-personal-token")).toBeNull();
    expect(session.isUnlocked).toBe(false);
  });
});
