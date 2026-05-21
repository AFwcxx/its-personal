import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import "./styles/theme.css";
import "./styles/layout.css";

createApp(App).use(createPinia()).use(router).mount("#app");
