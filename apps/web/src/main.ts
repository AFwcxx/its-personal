import { createPinia } from "pinia";
import * as PrimeVueConfig from "@primevue/core/config";
import Aura from "@primeuix/themes/aura";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import "./styles/theme.css";
import "./styles/layout.css";

const PrimeVue = PrimeVueConfig.default;

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
