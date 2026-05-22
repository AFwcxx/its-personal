import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Its Personal",
        short_name: "Planner",
        start_url: "/",
        display: "standalone",
        background_color: "#fffdf7",
        theme_color: "#fffdf7",
        icons: []
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/planner\/snapshot/,
            handler: "NetworkFirst",
            options: { cacheName: "planner-snapshot" }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000"
    }
  },
  test: {
    environment: "jsdom"
  }
});
