<script setup lang="ts">
import { sortPlannerItems, type Task } from "@its-personal/shared";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const search = ref("");
const showCompleted = ref(false);
onMounted(() => planner.refresh());
const tasks = computed(() => planner.allVisible(search.value, showCompleted.value));

const groups = computed(() => {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks.value) {
    const key = task.dueDate ?? "No date";
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
</script>

<template>
  <AppShell>
    <h2>All Tasks</h2>
    <div class="toolbar">
      <InputText v-model="search" placeholder="Search tasks" />
      <label class="check-label"><Checkbox v-model="showCompleted" binary /> Show completed</label>
    </div>
    <section v-for="group in groups" :key="group.date" class="date-group">
      <h3 class="date-heading">Date: {{ group.date }}</h3>
      <TaskList :tasks="group.tasks" />
    </section>
  </AppShell>
</template>
