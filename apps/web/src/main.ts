import { createPinia } from "pinia";
import * as PrimeVueConfig from "@primevue/core/config";
import Aura from "@primeuix/themes/aura";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import "primeicons/primeicons.css";
import "./styles/theme.css";
import "./styles/layout.css";

const PrimeVue = PrimeVueConfig.default;
const storedTheme = localStorage.getItem("its-personal-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const theme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : prefersDark ? "dark" : "light";
document.documentElement.dataset.theme = theme;

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue as any, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: ':root[data-theme="dark"]'
      }
    }
  })
  .mount("#app");
