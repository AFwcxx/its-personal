import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      "@its-personal/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Its Personal",
        short_name: "Planner",
        start_url: "/",
        display: "standalone",
        background_color: "#070710",
        theme_color: "#070710",
        icons: []
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/planner\/snapshot/,
            handler: "NetworkFirst",
            options: { cacheName: "planner-snapshot" }
          },
          {
            urlPattern: /\/api\/notes\/snapshot/,
            handler: "NetworkFirst",
            options: { cacheName: "notes-snapshot" }
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
