import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "./stores/session.js";
import AllTasksView from "./views/AllTasksView.vue";
import ArchiveView from "./views/ArchiveView.vue";
import ManageTagsView from "./views/ManageTagsView.vue";
import PlannerView from "./views/PlannerView.vue";
import ScheduleView from "./views/ScheduleView.vue";
import UnlockView from "./views/UnlockView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/unlock", component: UnlockView },
    { path: "/", redirect: "/planner" },
    { path: "/planner", component: PlannerView },
    { path: "/all", component: AllTasksView },
    { path: "/schedule", component: ScheduleView },
    { path: "/archive", component: ArchiveView },
    { path: "/tags", component: ManageTagsView }
  ]
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (to.path !== "/unlock" && !session.isUnlocked) return "/unlock";
  if (to.path === "/unlock" && session.isUnlocked) return "/planner";
  return true;
});
