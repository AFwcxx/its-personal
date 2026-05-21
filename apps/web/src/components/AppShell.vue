<script setup lang="ts">
import Button from "primevue/button";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { usePlannerStore } from "../stores/planner.js";
import TaskDetailPanel from "./TaskDetailPanel.vue";

const navItems = [
  { to: "/planner", label: "Planner" },
  { to: "/all", label: "All Tasks" },
  { to: "/schedule", label: "Schedule" },
  { to: "/archive", label: "Archive" },
  { to: "/tags", label: "Tags" }
];

const planner = usePlannerStore();
const hasDetail = computed(() => planner.selectedTask !== null);
</script>

<template>
  <div class="app-shell" :class="{ 'has-detail': hasDetail }">
    <aside class="sidebar">
      <h1>Its Personal</h1>
      <nav>
        <RouterLink v-for="item in navItems" :key="item.to" v-slot="{ navigate, isActive }" :to="item.to" custom>
          <Button :class="{ active: isActive }" :label="item.label" text @click="navigate" />
        </RouterLink>
      </nav>
      <p class="muted">v0.0.1</p>
    </aside>
    <main class="main">
      <slot />
    </main>
    <TaskDetailPanel />
  </div>
</template>
