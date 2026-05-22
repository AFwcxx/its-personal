import { ref } from "vue";

const DEFAULT_APP_TITLE = "Its Personal";

export const appTitle = ref(DEFAULT_APP_TITLE);

type RuntimeConfig = {
  appTitle?: unknown;
};

export async function loadRuntimeConfig(fetchConfig = fetch): Promise<void> {
  try {
    const response = await fetchConfig("/api/config");
    if (!response.ok) return;

    const config = await response.json() as RuntimeConfig;
    if (typeof config.appTitle !== "string" || config.appTitle.trim() === "") return;

    appTitle.value = config.appTitle;
    document.title = config.appTitle;
  } catch {
    appTitle.value = DEFAULT_APP_TITLE;
  }
}
