<script setup lang="ts">
import { RouterLink } from "vue-router";
import TaskDetailPanel from "./TaskDetailPanel.vue";
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h1>Its Personal</h1>
      <nav>
        <RouterLink to="/planner">Planner</RouterLink>
        <RouterLink to="/all">All Tasks</RouterLink>
        <RouterLink to="/schedule">Schedule</RouterLink>
        <RouterLink to="/archive">Archive</RouterLink>
        <RouterLink to="/tags">Tags</RouterLink>
      </nav>
      <p class="muted">v0.0.1</p>
    </aside>
    <main class="main">
      <slot />
    </main>
    <TaskDetailPanel />
  </div>
</template>
