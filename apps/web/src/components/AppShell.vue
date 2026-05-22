<script setup lang="ts">
import Button from "primevue/button";
import { registerSW } from "virtual:pwa-register";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { appTitle } from "../config.js";
import { usePlannerStore } from "../stores/planner.js";
import { useSessionStore } from "../stores/session.js";
import SubtaskCreateDialog from "./SubtaskCreateDialog.vue";
import TaskDetailPanel from "./TaskDetailPanel.vue";

const navItems = [
  { to: "/planner", label: "Planner" },
  { to: "/schedule", label: "Schedule" },
  { to: "/all", label: "All Tasks" },
  { to: "/archive", label: "Archive" },
  { to: "/tags", label: "Tags" }
];

const planner = usePlannerStore();
const session = useSessionStore();
const router = useRouter();
const hasDetail = computed(() => planner.selectedTask !== null);
const detailLeaving = ref(false);
const hardRefreshInProgress = ref(false);
const updateServiceWorker = registerSW({ immediate: true });

onMounted(() => session.startActivityTracking());
watch(() => session.isUnlocked, (isUnlocked) => {
  if (!isUnlocked) void router.push("/unlock");
});

async function lock() {
  await session.lock();
  await router.push("/unlock");
}

async function updateCachesAndServiceWorker() {
  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }

  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.update()));
  registrations.forEach((registration) => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
  await updateServiceWorker(true);
}

async function hardRefresh() {
  if (hardRefreshInProgress.value) return;
  hardRefreshInProgress.value = true;

  try {
    await updateCachesAndServiceWorker();
  } catch {
    // Fall back to a normal reload if service-worker or cache refresh fails.
  } finally {
    window.location.reload();
  }
}
</script>

<template>
  <div class="app-shell" :class="{ 'has-detail': hasDetail || detailLeaving }">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>{{ appTitle }}</h1>
        <div class="sidebar-header-actions">
          <Button
            aria-label="Hard refresh"
            :disabled="hardRefreshInProgress"
            icon="pi pi-sync"
            rounded
            text
            @click="hardRefresh"
          />
          <Button aria-label="Lock" icon="pi pi-lock" rounded text @click="lock" />
        </div>
      </div>
      <nav>
        <RouterLink v-for="item in navItems" :key="item.to" v-slot="{ navigate, isActive }" :to="item.to" custom>
          <Button :class="{ active: isActive }" :label="item.label" text @click="navigate" />
        </RouterLink>
      </nav>
      <div class="muted app-version">
        <Button aria-label="Lock" icon="pi pi-lock" rounded text @click="lock" />
        <Button
          aria-label="Hard refresh"
          :disabled="hardRefreshInProgress"
          icon="pi pi-sync"
          rounded
          text
          @click="hardRefresh"
        />
        <span>v0.0.1</span>
      </div>
    </aside>
    <main class="main">
      <slot />
    </main>
    <Transition name="detail-panel" @before-leave="detailLeaving = true" @after-leave="detailLeaving = false">
      <TaskDetailPanel v-if="hasDetail" />
    </Transition>
    <SubtaskCreateDialog />
  </div>
</template>
