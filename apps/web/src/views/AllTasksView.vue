<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
const showCompleted = ref(false);
onMounted(() => planner.refresh());
const tasks = computed(() => planner.allVisible(search.value, showCompleted.value));
</script>

<template>
  <AppShell>
    <h2>All Tasks</h2>
    <div class="toolbar">
      <input v-model="search" placeholder="Search tasks" />
      <label><input v-model="showCompleted" type="checkbox" /> Show completed</label>
    </div>
    <TaskList :tasks="tasks" />
  </AppShell>
</template>
