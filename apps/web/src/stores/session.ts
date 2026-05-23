import { defineStore } from "pinia";

const tokenKey = "its-personal-token";
const idleTimeoutKey = "its-personal-idle-timeout-seconds";
const lastActivityKey = "its-personal-last-activity-at";
const deviceKey = "its-personal-device-id";
const themeKey = "its-personal-theme";
const systemThemeQuery = "(prefers-color-scheme: dark)";
const heartbeatMs = 5 * 60 * 1000;
const lightThemeColor = "#f1f3f1";
const darkThemeColor = "#09090b";

let activityTrackingStarted = false;
let activeSystemThemeQuery: MediaQueryList | null = null;
let appTheme: ThemePreference = "dark";

type ThemePreference = "system" | "light" | "dark";

function readThemePreference(): ThemePreference {
  if (appTheme !== "system") return appTheme;

  const theme = localStorage.getItem(themeKey);
  return theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
}

function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia(systemThemeQuery).matches ? "dark" : "light";
}

function applyTheme(theme: ThemePreference) {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.dataset.theme = resolvedTheme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    resolvedTheme === "dark" ? darkThemeColor : lightThemeColor
  );
}

function createDeviceId() {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function initializeTheme() {
  applyTheme(readThemePreference());

  const query = window.matchMedia(systemThemeQuery);
  if (activeSystemThemeQuery === query) return;
  activeSystemThemeQuery = query;

  query.addEventListener("change", () => {
    const theme = readThemePreference();
    if (theme === "system") applyTheme(theme);
  });
}

export function configureAppTheme(theme: ThemePreference) {
  appTheme = theme;
  applyTheme(readThemePreference());
}

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: sessionStorage.getItem(tokenKey),
    idleTimeoutSeconds: Number(sessionStorage.getItem(idleTimeoutKey) ?? 10_800),
    lastActivityAt: Number(sessionStorage.getItem(lastActivityKey) ?? 0),
    lastHeartbeatAt: 0,
    deviceId: createDeviceId(),
    theme: readThemePreference(),
    error: "",
    offline: false
  }),
  getters: {
    isUnlocked: (state) => Boolean(state.token && state.lastActivityAt && Date.now() - state.lastActivityAt < state.idleTimeoutSeconds * 1000)
  },
  actions: {
    async unlock(password: string) {
      localStorage.setItem(deviceKey, this.deviceId);
      let response: Response;
      try {
        response = await fetch("/api/auth/unlock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password, deviceId: this.deviceId })
        });
      } catch {
        this.error = "Server unavailable";
        return false;
      }
      if (!response.ok) {
        this.error = "Invalid password";
        return false;
      }
      const body = await response.json() as { token: string; idleTimeoutSeconds: number };
      this.token = body.token;
      this.idleTimeoutSeconds = body.idleTimeoutSeconds;
      this.recordActivity(false);
      sessionStorage.setItem(tokenKey, body.token);
      sessionStorage.setItem(idleTimeoutKey, String(body.idleTimeoutSeconds));
      this.error = "";
      return true;
    },
    authHeaders(): HeadersInit {
      if (this.token && !this.isUnlocked) this.lockLocal();
      return this.token ? { authorization: `Bearer ${this.token}` } : {};
    },
    recordActivity(sendHeartbeat = true) {
      if (!this.token) return;
      const now = Date.now();
      this.lastActivityAt = now;
      sessionStorage.setItem(lastActivityKey, String(now));
      if (!sendHeartbeat) {
        this.lastHeartbeatAt = now;
        return;
      }
      if (now - this.lastHeartbeatAt < heartbeatMs) return;
      this.lastHeartbeatAt = now;
      void this.sendActivityHeartbeat();
    },
    async sendActivityHeartbeat() {
      if (!this.token || !this.isUnlocked) return;
      const response = await fetch("/api/auth/activity", { method: "POST", headers: this.authHeaders() });
      if (response.status === 401) {
        this.lockLocal();
        return;
      }
      if (response.ok) {
        const body = await response.json() as { idleTimeoutSeconds?: number };
        if (body.idleTimeoutSeconds) {
          this.idleTimeoutSeconds = body.idleTimeoutSeconds;
          sessionStorage.setItem(idleTimeoutKey, String(body.idleTimeoutSeconds));
        }
      }
    },
    startActivityTracking() {
      if (activityTrackingStarted) return;
      activityTrackingStarted = true;
      for (const eventName of ["pointermove", "click", "touchstart", "keydown", "scroll", "focus"]) {
        window.addEventListener(eventName, () => this.recordActivity(), { passive: true });
      }
      window.setInterval(() => {
        if (this.token && !this.isUnlocked) this.lockLocal();
      }, 30_000);
    },
    setTheme(theme: ThemePreference) {
      this.theme = theme;
      localStorage.setItem(themeKey, theme);
      applyTheme(readThemePreference());
    },
    async lock() {
      const token = this.token;
      this.lockLocal();
      if (token) await fetch("/api/auth/lock", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
    },
    lockLocal() {
      this.token = null;
      this.lastActivityAt = 0;
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(idleTimeoutKey);
      sessionStorage.removeItem(lastActivityKey);
    }
  }
});
