import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { initializeTheme, useSessionStore } from "../stores/session.js";

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

  it("updates the active theme when the system theme changes", () => {
    const systemTheme = stubSystemTheme(false);

    initializeTheme();
    expect(document.documentElement.dataset.theme).toBe("light");

    systemTheme.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    systemTheme.setMatches(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps explicit theme overrides when the system theme changes", () => {
    const systemTheme = stubSystemTheme(false);
    const session = useSessionStore();

    initializeTheme();
    session.setTheme("dark");
    systemTheme.setMatches(false);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
