<script setup lang="ts">
import Button from "primevue/button";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const month = ref(new Date());
const selected = ref(planner.currentDate);
onMounted(() => planner.refresh());

const days = computed(() => {
  const first = new Date(Date.UTC(month.value.getFullYear(), month.value.getMonth(), 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
});

const selectedTasks = computed(() => planner.tasksFor(selected.value));
function move(delta: number) {
  month.value = new Date(Date.UTC(month.value.getFullYear(), month.value.getMonth() + delta, 1));
}

function dayTasks(day: string) {
  return planner.tasksFor(day);
}
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Schedule</h2>
      <Button label="Prev" severity="secondary" @click="move(-1)" />
      <span>{{ month.toLocaleString(undefined, { month: "long", year: "numeric" }) }}</span>
      <Button label="Next" severity="secondary" @click="move(1)" />
    </div>
    <div class="calendar">
      <Button
        v-for="day in days"
        :key="day"
        :class="{ active: selected === day, today: planner.today === day, 'empty-day': dayTasks(day).length === 0 }"
        text
        @click="selected = day"
      >
        <strong>{{ Number(day.slice(8)) }}</strong>
        <div class="muted">{{ dayTasks(day).length }} tasks</div>
      </Button>
    </div>
    <h3>{{ selected }}</h3>
    <TaskList :tasks="selectedTasks" />
  </AppShell>
</template>
