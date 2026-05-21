<script setup lang="ts">
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
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Schedule</h2>
      <button @click="move(-1)">Prev</button>
      <span>{{ month.toLocaleString(undefined, { month: "long", year: "numeric" }) }}</span>
      <button @click="move(1)">Next</button>
    </div>
    <div class="calendar">
      <button v-for="day in days" :key="day" :class="{ active: selected === day }" @click="selected = day">
        <strong>{{ Number(day.slice(8)) }}</strong>
        <div class="muted">{{ planner.tasksFor(day).length }} tasks</div>
      </button>
    </div>
    <h3>{{ selected }}</h3>
    <TaskList :tasks="selectedTasks" />
  </AppShell>
</template>
