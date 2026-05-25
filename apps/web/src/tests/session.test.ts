import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { initializeTheme, useSessionStore } from "../stores/session.js";

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute("data-theme");
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

  it("initializes dark theme and clears stale theme preferences", () => {
    localStorage.setItem("its-personal-theme", "light");

    initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("its-personal-theme")).toBeNull();
  });

  it("creates a device id when native UUIDs are unavailable outside secure contexts", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        return bytes;
      })
    });

    const session = useSessionStore();

    expect(session.deviceId).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
