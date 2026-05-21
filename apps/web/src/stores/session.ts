import { defineStore } from "pinia";

const tokenKey = "its-personal-token";
const expiryKey = "its-personal-expires-at";
const deviceKey = "its-personal-device-id";
const themeKey = "its-personal-theme";

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: localStorage.getItem(tokenKey),
    expiresAt: localStorage.getItem(expiryKey),
    deviceId: localStorage.getItem(deviceKey) ?? crypto.randomUUID(),
    theme: localStorage.getItem(themeKey) ?? "system",
    error: "",
    offline: false
  }),
  getters: {
    isUnlocked: (state) => Boolean(state.token && state.expiresAt && Date.parse(state.expiresAt) > Date.now())
  },
  actions: {
    async unlock(password: string) {
      localStorage.setItem(deviceKey, this.deviceId);
      const response = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, deviceId: this.deviceId })
      });
      if (!response.ok) {
        this.error = "Invalid password";
        return false;
      }
      const body = await response.json() as { token: string; expiresAt: string };
      this.token = body.token;
      this.expiresAt = body.expiresAt;
      localStorage.setItem(tokenKey, body.token);
      localStorage.setItem(expiryKey, body.expiresAt);
      this.error = "";
      return true;
    },
    authHeaders(): HeadersInit {
      return this.token ? { authorization: `Bearer ${this.token}` } : {};
    },
    setTheme(theme: "system" | "light" | "dark") {
      this.theme = theme;
      localStorage.setItem(themeKey, theme);
      document.documentElement.dataset.theme = theme;
    },
    lock() {
      this.token = null;
      this.expiresAt = null;
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(expiryKey);
    }
  }
});
