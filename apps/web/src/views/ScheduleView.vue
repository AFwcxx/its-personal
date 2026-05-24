<script setup lang="ts">
import { completedPlannerTasksForDate, type Task } from "@its-personal/shared";
import Button from "primevue/button";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskCreateForm from "../components/TaskCreateForm.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const month = ref(new Date());
const selected = ref(planner.currentDate);
const completedExpanded = ref(localStorage.getItem("its-personal-schedule-completed-expanded") === "true");
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

const selectedTasks = computed(() => planner.scheduledTasksFor(selected.value));
const completedTasks = computed(() => completedPlannerTasksForDate(planner.tasks, selected.value));

async function reorder(tasks: Task[]) {
  await planner.reorderTasks(tasks);
}

function toggleCompleted() {
  completedExpanded.value = !completedExpanded.value;
  localStorage.setItem("its-personal-schedule-completed-expanded", String(completedExpanded.value));
}

function move(delta: number) {
  month.value = new Date(Date.UTC(month.value.getFullYear(), month.value.getMonth() + delta, 1));
}

function dayTasks(day: string) {
  return planner.scheduledTasksFor(day);
}

function isCurrentMonth(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  return date.getUTCFullYear() === month.value.getFullYear() && date.getUTCMonth() === month.value.getMonth();
}

function selectDay(day: string) {
  if (!isCurrentMonth(day)) {
    return;
  }
  selected.value = day;
}
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Schedule</h2>
      <div class="schedule-month-controls">
        <Button label="Prev" severity="secondary" @click="move(-1)" />
        <span>{{ month.toLocaleString(undefined, { month: "long", year: "numeric" }) }}</span>
        <Button label="Next" severity="secondary" @click="move(1)" />
      </div>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      <span>Sun</span>
      <span>Mon</span>
      <span>Tue</span>
      <span>Wed</span>
      <span>Thu</span>
      <span>Fri</span>
      <span>Sat</span>
    </div>
    <div class="calendar">
      <Button
        v-for="day in days"
        :key="day"
        :class="{ active: selected === day, today: planner.today === day, 'empty-day': dayTasks(day).length === 0, 'outside-month': !isCurrentMonth(day) }"
        :disabled="!isCurrentMonth(day)"
        text
        @click="selectDay(day)"
      >
        <strong class="calendar-day-number">{{ Number(day.slice(8)) }}</strong>
        <div v-if="isCurrentMonth(day) && dayTasks(day).length > 0" class="muted">{{ dayTasks(day).length }} tasks</div>
      </Button>
    </div>
    <TaskCreateForm :due-date="selected" :show-due-date="false" />
    <h3>{{ selected }}</h3>
    <TaskList :tasks="selectedTasks" :reorderable="true" @reorder="reorder" />
    <section class="completed-section">
      <button class="completed-toggle" type="button" @click="toggleCompleted">
        <span>Completed</span>
        <span class="muted">{{ completedTasks.length }}</span>
        <span aria-hidden="true">{{ completedExpanded ? "▾" : "▸" }}</span>
      </button>
      <TaskList v-if="completedExpanded" :tasks="completedTasks" />
    </section>
  </AppShell>
</template>
