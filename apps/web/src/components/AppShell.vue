<script setup lang="ts">
import Button from "primevue/button";
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { usePlannerStore } from "../stores/planner.js";
import TaskDetailPanel from "./TaskDetailPanel.vue";

const navItems = [
  { to: "/planner", label: "Planner" },
  { to: "/schedule", label: "Schedule" },
  { to: "/all", label: "All Tasks" },
  { to: "/archive", label: "Archive" },
  { to: "/tags", label: "Tags" }
];

const planner = usePlannerStore();
const hasDetail = computed(() => planner.selectedTask !== null);
const detailLeaving = ref(false);
</script>

<template>
  <div class="app-shell" :class="{ 'has-detail': hasDetail || detailLeaving }">
    <aside class="sidebar">
      <h1>Its Personal</h1>
      <nav>
        <RouterLink v-for="item in navItems" :key="item.to" v-slot="{ navigate, isActive }" :to="item.to" custom>
          <Button :class="{ active: isActive }" :label="item.label" text @click="navigate" />
        </RouterLink>
      </nav>
      <p class="muted app-version">v0.0.1</p>
    </aside>
    <main class="main">
      <slot />
    </main>
    <Transition name="detail-panel" @before-leave="detailLeaving = true" @after-leave="detailLeaving = false">
      <TaskDetailPanel v-if="hasDetail" />
    </Transition>
  </div>
</template>
