<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const tab = ref("today");
const search = ref("");
const newTitle = ref("");

onMounted(() => planner.refresh());

const visibleTasks = computed(() => {
  const tasks = tab.value === "overdue" ? planner.overdue() : planner.tasksFor(planner.dateForTab(tab.value));
  const q = search.value.toLowerCase();
  return tasks.filter((task) => task.title.toLowerCase().includes(q));
});

async function createTask() {
  if (!newTitle.value.trim() || planner.status === "offline") return;
  await planner.createTask(newTitle.value.trim(), planner.dateForTab(tab.value));
  newTitle.value = "";
}
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Planner</h2>
      <span v-if="planner.status === 'offline'" class="muted">Offline read-only</span>
    </div>
    <div class="tabs">
      <button :class="{ active: tab === 'overdue' }" @click="tab = 'overdue'">Overdue</button>
      <button :class="{ active: tab === 'today' }" @click="tab = 'today'">Today</button>
      <button :class="{ active: tab === 'tomorrow' }" @click="tab = 'tomorrow'">Tomorrow</button>
      <button :class="{ active: tab === 'day-after' }" @click="tab = 'day-after'">Day After</button>
    </div>
    <div class="toolbar">
      <input v-model="search" placeholder="Search tasks" />
      <input v-model="newTitle" placeholder="New task" @keydown.enter.prevent="createTask" />
      <button :disabled="planner.status === 'offline'" @click="createTask">Add</button>
    </div>
    <TaskList :tasks="visibleTasks" />
  </AppShell>
</template>
