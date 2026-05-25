<script setup lang="ts">
import { completedPlannerTasksForDate, sortPlannerItems, type Task } from "@its-personal/shared";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import TaskCreateForm from "../components/TaskCreateForm.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const tab = ref("today");
const search = ref("");
const newDueDate = ref(planner.dateForTab(tab.value));
const completedExpanded = ref(localStorage.getItem("its-personal-completed-expanded") === "true");
const overdueMovePending = ref<{ date: string; tasks: Task[] } | null>(null);
const tabs = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "day-after", label: "Day After" }
];

onMounted(() => planner.refresh());

function isRecentlyCompleted(task: { completedAt: string | null }) {
  if (!task.completedAt) return false;
  return Date.now() - new Date(task.completedAt).getTime() <= 24 * 60 * 60 * 1000;
}

function completedGroupTasks(predicate: (task: Task) => boolean) {
  const byId = new Map(planner.tasks.map((task) => [task.id, task]));
  const groups = planner.tasks.filter((task) => {
    if (task.deletedAt !== null || task.completedAt === null) return false;
    if (task.parentId !== null && byId.has(task.parentId)) return false;
    return predicate(task);
  });
  const children = planner.tasks.filter((task) => {
    if (task.deletedAt !== null || task.completedAt === null || task.parentId === null) return false;
    const parent = byId.get(task.parentId);
    return parent !== undefined && parent.completedAt !== null && groups.some((group) => group.id === parent.id);
  });
  return [...groups, ...children];
}

function groupTasksByDueDate(tasks: Task[]) {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
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
}

const visibleTasks = computed(() => {
  const tasks = tab.value === "overdue" ? planner.overdue() : planner.tasksFor(planner.dateForTab(tab.value));
  const q = search.value.toLowerCase();
  return tasks.filter((task) => task.title.toLowerCase().includes(q));
});

const visibleGroups = computed(() => groupTasksByDueDate(visibleTasks.value));
const canMoveOverdueGroupsToToday = computed(() => tab.value === "overdue" && search.value.trim() === "");

const completedTasks = computed(() => {
  const q = search.value.toLowerCase();
  const tasks = tab.value === "overdue"
    ? completedGroupTasks((task) => task.dueDate < planner.today && isRecentlyCompleted(task))
    : completedPlannerTasksForDate(planner.tasks, planner.dateForTab(tab.value));
  return tasks.filter((task) => task.title.toLowerCase().includes(q));
});

const completedGroups = computed(() => groupTasksByDueDate(completedTasks.value));

const canCreateTask = computed(() => tab.value !== "overdue");
const canReorder = computed(() => ["overdue", "today", "tomorrow", "day-after"].includes(tab.value));

function selectTab(key: string) {
  tab.value = key;
  newDueDate.value = planner.dateForTab(key);
}

function toggleCompleted() {
  completedExpanded.value = !completedExpanded.value;
  localStorage.setItem("its-personal-completed-expanded", String(completedExpanded.value));
}

async function reorder(tasks: Task[]) {
  await planner.reorderTasks(tasks);
}

function tasksWithDescendants(tasks: Task[]) {
  const byParentId = new Map<string, Task[]>();
  for (const task of planner.tasks) {
    if (task.parentId === null || task.deletedAt !== null) continue;
    byParentId.set(task.parentId, [...(byParentId.get(task.parentId) ?? []), task]);
  }

  const byId = new Map<string, Task>();
  const queue = [...tasks];
  while (queue.length > 0) {
    const task = queue.shift();
    if (!task || byId.has(task.id)) continue;
    byId.set(task.id, task);
    queue.push(...(byParentId.get(task.id) ?? []));
  }
  return [...byId.values()];
}

function requestMoveGroupToToday(date: string, tasks: Task[]) {
  const updates = tasksWithDescendants(tasks).filter((task) => task.dueDate !== planner.today);
  overdueMovePending.value = updates.length > 0 ? { date, tasks: updates } : null;
}

async function confirmMoveGroupToToday() {
  const updates = overdueMovePending?.value?.tasks ?? [];
  for (const task of updates) {
    await planner.updateTask(task.id, { dueDate: planner.today });
  }
  overdueMovePending.value = null;
}
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Planner</h2>
      <Message v-if="planner.status === 'offline'" severity="warn" size="small">Offline changes will sync later</Message>
    </div>
    <div class="planner-filter-row">
      <div class="tabs">
        <Button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" :label="item.label" text @click="selectTab(item.key)" />
      </div>
      <InputText v-model="search" placeholder="Search tasks" />
    </div>
    <TaskCreateForm v-if="canCreateTask" v-model:due-date="newDueDate" />
    <template v-if="tab === 'overdue'">
      <section v-for="group in visibleGroups" :key="group.date" class="date-group">
        <div class="date-heading-row">
          <h3 class="date-heading">Date: {{ group.date }}</h3>
          <button
            v-if="canMoveOverdueGroupsToToday"
            class="date-move-today-button"
            type="button"
            aria-label="Move overdue group to today"
            title="Move overdue group to today"
            :disabled="planner.status === 'offline'"
            @click="requestMoveGroupToToday(group.date, group.tasks)"
          >
            <i class="pi pi-sun" aria-hidden="true" />
          </button>
        </div>
        <TaskList :tasks="group.tasks" :reorderable="canReorder" @reorder="reorder" />
      </section>
    </template>
    <TaskList v-else :tasks="visibleTasks" :reorderable="canReorder" @reorder="reorder" />
    <section class="completed-section">
      <button class="completed-toggle" type="button" @click="toggleCompleted">
        <span>Completed</span>
        <span class="muted">{{ completedTasks.length }}</span>
        <span aria-hidden="true">{{ completedExpanded ? "▾" : "▸" }}</span>
      </button>
      <template v-if="completedExpanded && tab === 'overdue'">
        <section v-for="group in completedGroups" :key="group.date" class="date-group">
          <h3 class="date-heading">Date: {{ group.date }}</h3>
          <TaskList :tasks="group.tasks" />
        </section>
      </template>
      <TaskList v-else-if="completedExpanded" :tasks="completedTasks" />
    </section>
    <Dialog
      :visible="overdueMovePending !== null"
      modal
      header="Move overdue tasks"
      :style="{ width: 'min(420px, 92vw)' }"
      @update:visible="overdueMovePending = $event ? overdueMovePending : null"
    >
      <p v-if="overdueMovePending">
        Move {{ overdueMovePending.tasks.length }} task{{ overdueMovePending.tasks.length === 1 ? "" : "s" }} from {{ overdueMovePending.date }} to today ({{ planner.today }})?
      </p>
      <div class="dialog-actions">
        <Button label="Confirm" @click="confirmMoveGroupToToday" />
      </div>
    </Dialog>
  </AppShell>
</template>
