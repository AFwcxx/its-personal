import { ref } from "vue";
import { configureAppTheme } from "./stores/session.js";

const DEFAULT_APP_TITLE = "Its Personal";

export const appTitle = ref(DEFAULT_APP_TITLE);

type AppTheme = "system" | "light" | "dark";

type RuntimeConfig = {
  appTitle?: unknown;
  appTheme?: unknown;
};

function readAppTheme(value: unknown): AppTheme {
  return value === "system" || value === "light" || value === "dark" ? value : "dark";
}

export async function loadRuntimeConfig(fetchConfig = fetch): Promise<void> {
  try {
    const response = await fetchConfig("/api/config");
    if (!response.ok) return;

    const config = await response.json() as RuntimeConfig;
    configureAppTheme(readAppTheme(config.appTheme));
    if (typeof config.appTitle !== "string" || config.appTitle.trim() === "") return;

    appTitle.value = config.appTitle;
    document.title = config.appTitle;
  } catch {
    appTitle.value = DEFAULT_APP_TITLE;
    configureAppTheme("dark");
  }
}
