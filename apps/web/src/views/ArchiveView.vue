<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
onMounted(() => planner.refresh());
const tasks = computed(() => planner.archiveTasks.filter((task) => task.title.toLowerCase().includes(search.value.toLowerCase())));
</script>

<template>
  <AppShell>
    <h2>Archive</h2>
    <input v-model="search" placeholder="Search archive" />
    <TaskList :tasks="tasks" />
  </AppShell>
</template>
