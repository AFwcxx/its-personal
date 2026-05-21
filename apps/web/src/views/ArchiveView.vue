<script setup lang="ts">
import { sortPlannerItems, type Task } from "@its-personal/shared";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
onMounted(() => planner.refresh());
const tasks = computed(() => planner.archiveTasks.filter((task) => task.title.toLowerCase().includes(search.value.toLowerCase())));

const groups = computed(() => {
  const grouped = new Map<string, Task[]>();
  const byId = new Map(tasks.value.map((task) => [task.id, task]));
  for (const task of tasks.value) {
    const parent = task.parentId ? byId.get(task.parentId) : null;
    const key = (parent?.completedAt ?? task.completedAt)?.slice(0, 10) ?? "No completion date";
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, tasks: sortPlannerItems(items) }));
});
</script>

<template>
  <AppShell>
    <h2>Archive</h2>
    <InputText v-model="search" placeholder="Search archive" />
    <section v-for="group in groups" :key="group.date" class="date-group">
      <h3 class="date-heading">Date: {{ group.date }}</h3>
      <TaskList :tasks="group.tasks" />
    </section>
  </AppShell>
</template>
