import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { configureAppTheme, initializeTheme, useSessionStore } from "../stores/session.js";

function stubSystemTheme(prefersDark = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_event: "change", listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: "change", listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  };

  vi.stubGlobal("matchMedia", vi.fn(() => query as unknown as MediaQueryList));

  return {
    query,
    setMatches(matches: boolean) {
      query.matches = matches;
      const event = { matches, media: query.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    }
  };
}

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
    configureAppTheme("dark");
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

  it("defaults the app theme to dark", () => {
    stubSystemTheme(false);

    initializeTheme();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates the active theme when the configured app theme follows the system", () => {
    const systemTheme = stubSystemTheme(false);

    configureAppTheme("system");
    initializeTheme();
    expect(document.documentElement.dataset.theme).toBe("light");

    systemTheme.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    systemTheme.setMatches(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps explicit theme overrides when the configured app theme follows the system", () => {
    const systemTheme = stubSystemTheme(false);
    const session = useSessionStore();

    configureAppTheme("system");
    initializeTheme();
    session.setTheme("dark");
    systemTheme.setMatches(false);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores local theme overrides when the configured app theme is authoritative", () => {
    const systemTheme = stubSystemTheme(false);
    const session = useSessionStore();

    configureAppTheme("light");
    initializeTheme();
    session.setTheme("dark");
    systemTheme.setMatches(true);

    expect(document.documentElement.dataset.theme).toBe("light");
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
