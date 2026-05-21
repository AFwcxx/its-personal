import { defineStore } from "pinia";

const tokenKey = "its-personal-token";
const idleTimeoutKey = "its-personal-idle-timeout-seconds";
const lastActivityKey = "its-personal-last-activity-at";
const deviceKey = "its-personal-device-id";
const themeKey = "its-personal-theme";
const heartbeatMs = 5 * 60 * 1000;

let activityTrackingStarted = false;

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: sessionStorage.getItem(tokenKey),
    idleTimeoutSeconds: Number(sessionStorage.getItem(idleTimeoutKey) ?? 10_800),
    lastActivityAt: Number(sessionStorage.getItem(lastActivityKey) ?? 0),
    lastHeartbeatAt: 0,
    deviceId: localStorage.getItem(deviceKey) ?? crypto.randomUUID(),
    theme: localStorage.getItem(themeKey) ?? "system",
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
    setTheme(theme: "system" | "light" | "dark") {
      this.theme = theme;
      localStorage.setItem(themeKey, theme);
      document.documentElement.dataset.theme = theme;
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
