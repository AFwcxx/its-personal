import { ref } from "vue";

const DEFAULT_APP_TITLE = "Its Personal";

export const appTitle = ref(DEFAULT_APP_TITLE);
export const authMode = ref<"password" | "pin">("password");

type RuntimeConfig = {
  appTitle?: unknown;
  authMode?: unknown;
};

export async function loadRuntimeConfig(fetchConfig = fetch): Promise<void> {
  try {
    const response = await fetchConfig("/api/config");
    if (!response.ok) return;

    const config = await response.json() as RuntimeConfig;
    if (typeof config.appTitle === "string" && config.appTitle.trim() !== "") {
      appTitle.value = config.appTitle;
      document.title = config.appTitle;
    }
    if (config.authMode === "password" || config.authMode === "pin") authMode.value = config.authMode;
  } catch {
    appTitle.value = DEFAULT_APP_TITLE;
    authMode.value = "password";
  }
}
