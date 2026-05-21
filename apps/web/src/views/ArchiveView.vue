<script setup lang="ts">
import { sortPlannerItems, todayISO, type Task } from "@its-personal/shared";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
const rangeFrom = ref(addCalendarMonths(todayISO(), -1));
const rangeTo = ref(todayISO());
onMounted(() => planner.refresh());
const tasks = computed(() => planner.archiveTasks.filter((task) => {
  if (!task.dueDate) return false;
  return task.title.toLowerCase().includes(search.value.toLowerCase()) && task.dueDate >= rangeFrom.value && task.dueDate <= rangeTo.value;
}));

const groups = computed(() => {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks.value) {
    const key = task.dueDate;
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => {
      if (a === "No date") return 1;
      if (b === "No date") return -1;
      return b.localeCompare(a);
    })
    .map(([date, items]) => ({ date, tasks: sortPlannerItems(items) }));
});

function addCalendarMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + months;
  const day = parsed.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
</script>

<template>
  <AppShell>
    <h2>Archive</h2>
    <div class="toolbar archive-toolbar">
      <InputText v-model="search" placeholder="Search archive" />
      <label class="date-range-field">From<InputText v-model="rangeFrom" type="date" /></label>
      <label class="date-range-field">To<InputText v-model="rangeTo" type="date" /></label>
    </div>
    <section v-for="group in groups" :key="group.date" class="date-group">
      <h3 class="date-heading">Date: {{ group.date }}</h3>
      <TaskList :tasks="group.tasks" :hide-pin="true" />
    </section>
  </AppShell>
</template>
