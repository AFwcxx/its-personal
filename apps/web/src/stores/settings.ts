import { defineStore } from "pinia";
import { settingsApi } from "../services/api.js";
import type { MainNavigationId } from "@its-personal/shared";

export const navigationItems = [
  { id: "planner", to: "/planner", label: "Planner" },
  { id: "notes", to: "/notes", label: "Notes" },
  { id: "schedule", to: "/schedule", label: "Schedule" },
  { id: "tracker", to: "/tracker", label: "Tracker" },
  { id: "all", to: "/all", label: "All Tasks" },
  { id: "archive", to: "/archive", label: "Archive" },
  { id: "settings", to: "/settings", label: "Settings" }
] satisfies { id: MainNavigationId; to: string; label: string }[];

const defaultOrder = navigationItems.map((item) => item.id);

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    mainNavigationOrder: [...defaultOrder] as MainNavigationId[],
    loadState: "idle" as "idle" | "loading" | "loaded" | "error",
    error: ""
  }),
  getters: {
    orderedNavigationItems: (state) => state.mainNavigationOrder.map((id) => navigationItems.find((item) => item.id === id)!).filter(Boolean)
  },
  actions: {
    async load(force = false) {
      if (!force && this.loadState !== "idle") return;
      if (this.loadState === "loading") return;
      this.loadState = "loading";
      try {
        const result = await settingsApi.loadMainNavigation();
        this.mainNavigationOrder = result.orderedIds;
        this.error = "";
        this.loadState = "loaded";
      } catch {
        this.error = "Could not load navigation order. Try again when the server is reachable.";
        this.loadState = "error";
      }
    },
    async save(order: MainNavigationId[]) {
      const result = await settingsApi.saveMainNavigation(order);
      this.mainNavigationOrder = result.orderedIds;
      this.error = "";
      this.loadState = "loaded";
    }
  }
});
