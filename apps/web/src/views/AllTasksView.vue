<script setup lang="ts">
import { sortPlannerItems, todayISO, type Task } from "@its-personal/shared";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
const showCompleted = ref(false);
const initialToday = todayISO();
const rangeFrom = ref(initialToday);
const rangeTo = ref(addCalendarMonths(initialToday, 1));

onMounted(async () => {
  await planner.refresh();
  resetDefaultRange(planner.today);
});

const tasks = computed(() => planner.allVisible(search.value, showCompleted.value).filter((task) => {
  if (!task.dueDate) return false;
  return task.dueDate >= rangeFrom.value && task.dueDate <= rangeTo.value;
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
      return a.localeCompare(b);
    })
    .map(([date, items]) => ({ date, tasks: sortPlannerItems(items) }));
});

async function reorder(tasks: Task[]) {
  await planner.reorderTasks(tasks);
}

function addCalendarMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + months;
  const day = parsed.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function resetDefaultRange(today = todayISO()) {
  rangeFrom.value = today;
  rangeTo.value = addCalendarMonths(today, 1);
}
</script>

<template>
  <AppShell>
    <h2>All Tasks</h2>
    <div class="toolbar all-tasks-toolbar">
      <InputText v-model="search" placeholder="Search tasks" />
      <label class="date-range-field">From<InputText v-model="rangeFrom" type="date" /></label>
      <label class="date-range-field">To<InputText v-model="rangeTo" type="date" /></label>
      <label class="check-label"><Checkbox v-model="showCompleted" binary /> Show completed</label>
    </div>
    <section v-for="group in groups" :key="group.date" class="date-group">
      <h3 class="date-heading">Date: {{ group.date }}</h3>
      <TaskList :tasks="group.tasks" :reorderable="true" @reorder="reorder" />
    </section>
  </AppShell>
</template>
