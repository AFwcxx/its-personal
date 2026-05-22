<script setup lang="ts">
import Button from "primevue/button";
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

onMounted(() => session.startActivityTracking());
watch(() => session.isUnlocked, (isUnlocked) => {
  if (!isUnlocked) void router.push("/unlock");
});

async function lock() {
  await session.lock();
  await router.push("/unlock");
}
</script>

<template>
  <div class="app-shell" :class="{ 'has-detail': hasDetail || detailLeaving }">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>{{ appTitle }}</h1>
        <Button aria-label="Lock" icon="pi pi-lock" rounded text @click="lock" />
      </div>
      <nav>
        <RouterLink v-for="item in navItems" :key="item.to" v-slot="{ navigate, isActive }" :to="item.to" custom>
          <Button :class="{ active: isActive }" :label="item.label" text @click="navigate" />
        </RouterLink>
      </nav>
      <div class="muted app-version">
        <Button aria-label="Lock" icon="pi pi-lock" rounded text @click="lock" />
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
