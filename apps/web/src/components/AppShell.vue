<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import { registerSW } from "virtual:pwa-register";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { appTitle } from "../config.js";
import { usePlannerStore } from "../stores/planner.js";
import { useSessionStore } from "../stores/session.js";
import SubtaskCreateDialog from "./SubtaskCreateDialog.vue";
import TaskDetailPanel from "./TaskDetailPanel.vue";

const navItems = [
  { to: "/notes", label: "Notes" },
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
const syncStatusLabel = computed(() => {
  if (planner.failedSyncCount > 0) return `${planner.failedSyncCount} sync failed`;
  if (planner.pendingCount > 0) return `${planner.pendingCount} pending`;
  if (planner.status === "offline") return "Offline";
  return "";
});
const detailLeaving = ref(false);
const hardRefreshInProgress = ref(false);
const syncRecoveryDialogVisible = ref(false);
const discardFailedSyncDialogVisible = ref(false);
const updateServiceWorker = registerSW({ immediate: true });

onMounted(() => {
  session.startActivityTracking();
  void planner.refreshPendingStatus();
  window.addEventListener("online", () => void planner.refresh());
  window.setInterval(() => {
    if (planner.pendingCount > 0 && session.isUnlocked) void planner.refresh();
  }, 60_000);
  window.setInterval(() => {
    if (session.isUnlocked) void planner.refreshIfChanged().catch(() => undefined);
  }, 5_000);
});
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

async function retryFailedSync() {
  await planner.refresh();
  if (planner.failedSyncCount === 0) syncRecoveryDialogVisible.value = false;
}

async function discardFailedSync() {
  await planner.discardFailedSyncOperations();
  discardFailedSyncDialogVisible.value = false;
  syncRecoveryDialogVisible.value = false;
}

function closeTaskDetail() {
  planner.selectedTaskId = null;
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
      <button
        v-if="syncStatusLabel"
        type="button"
        class="sync-status"
        :class="{ 'sync-status-error': planner.failedSyncCount > 0 }"
        @click="syncRecoveryDialogVisible = true"
      >
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <span>{{ syncStatusLabel }}</span>
      </button>
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
    <button
      v-if="hasDetail"
      type="button"
      class="detail-backdrop"
      aria-label="Close task menu"
      @click="closeTaskDetail"
    />
    <Transition name="detail-panel" @before-leave="detailLeaving = true" @after-leave="detailLeaving = false">
      <TaskDetailPanel v-if="hasDetail" />
    </Transition>
    <SubtaskCreateDialog />
    <Dialog
      v-model:visible="syncRecoveryDialogVisible"
      modal
      header="Sync status"
      :style="{ width: 'min(480px, 92vw)' }"
    >
      <p v-if="planner.failedSyncCount > 0">
        {{ planner.failedSyncCount }} local change{{ planner.failedSyncCount === 1 ? "" : "s" }} failed to sync from this device. Other devices will not show this unless they have their own failed local changes.
      </p>
      <p v-else-if="planner.pendingCount > 0">
        {{ planner.pendingCount }} local change{{ planner.pendingCount === 1 ? "" : "s" }} pending sync from this device.
      </p>
      <p v-else-if="planner.status === 'offline'">
        This device is offline or the server could not be reached.
      </p>
      <p v-if="planner.failedSyncCount > 0 && planner.retryableFailedSyncCount === 0">
        These failed changes are not being retried because the server rejected them. Discard them only if the local edits are no longer needed.
      </p>
      <div class="dialog-actions">
        <Button
          v-if="planner.retryableFailedSyncCount > 0 || planner.pendingCount > planner.failedSyncCount"
          label="Retry now"
          icon="pi pi-sync"
          @click="retryFailedSync"
        />
        <Button
          v-if="planner.failedSyncCount > 0"
          label="Discard failed changes"
          severity="danger"
          outlined
          @click="discardFailedSyncDialogVisible = true"
        />
        <Button label="Close" severity="secondary" text @click="syncRecoveryDialogVisible = false" />
      </div>
    </Dialog>
    <Dialog
      v-model:visible="discardFailedSyncDialogVisible"
      modal
      header="Discard failed changes?"
      :style="{ width: 'min(420px, 92vw)' }"
    >
      <p>This clears the failed local sync queue on this device. Changes that never reached the server will be lost.</p>
      <div class="dialog-actions">
        <Button label="Cancel" severity="secondary" text @click="discardFailedSyncDialogVisible = false" />
        <Button label="Discard" severity="danger" @click="discardFailedSync" />
      </div>
    </Dialog>
    <Dialog
      :visible="planner.savedOfflineDialogVisible"
      modal
      header="Saved offline"
      :style="{ width: 'min(420px, 92vw)' }"
      @update:visible="planner.savedOfflineDialogVisible = $event"
    >
      <p>You're offline or the server could not be reached. This change is pending and will sync automatically when connectivity returns.</p>
      <div class="dialog-actions">
        <Button label="OK" @click="planner.savedOfflineDialogVisible = false" />
      </div>
    </Dialog>
  </div>
</template>
