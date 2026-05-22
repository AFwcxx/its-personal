<script setup lang="ts">
import { completedPlannerTasksForDate, sortPlannerItems, type Task } from "@its-personal/shared";
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import { computed, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
import AppShell from "../components/AppShell.vue";
import TaskList from "../components/TaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const tab = ref("today");
const search = ref("");
const newTitle = ref("");
const newDueDate = ref(planner.dateForTab(tab.value));
const newTagIds = ref<string[]>([]);
const completedExpanded = ref(localStorage.getItem("its-personal-completed-expanded") === "true");
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
const tagOptions = computed(() => planner.activeTags);
const tagsById = computed(() => new Map(planner.activeTags.map((tag) => [tag.id, tag])));

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

async function createTask() {
  if (!newTitle.value.trim() || !newDueDate.value || !canCreateTask.value || planner.status === "offline") return;
  await planner.createTask(newTitle.value.trim(), newDueDate.value, null, newTagIds.value);
  newTitle.value = "";
  newTagIds.value = [];
}

function tagStyle(tagId: string) {
  return { "--tag-color": tagsById.value.get(tagId)?.color ?? "#6b7280" };
}

function removeTagChip(event: MouseEvent, removeCallback: (event: Event, item?: unknown) => void) {
  removeCallback(event);
}

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
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Planner</h2>
      <Message v-if="planner.status === 'offline'" severity="warn" size="small">Offline read-only</Message>
    </div>
    <div class="planner-filter-row">
      <div class="tabs">
        <Button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" :label="item.label" text @click="selectTab(item.key)" />
      </div>
      <InputText v-model="search" placeholder="Search tasks" />
    </div>
    <Card v-if="canCreateTask" class="task-create-card">
      <template #content>
        <div class="task-create-form">
          <InputText v-model="newTitle" placeholder="New task" @keydown.enter.prevent="createTask" />
          <InputText v-model="newDueDate" type="date" aria-label="Due date" @keydown.enter.prevent="createTask" />
          <div class="task-create-actions">
            <Button :disabled="planner.status === 'offline'" label="Add" @click="createTask" />
            <MultiSelect
              class="tag-multiselect task-create-tags"
              v-model="newTagIds"
              :options="tagOptions"
              option-label="name"
              option-value="id"
              display="chip"
              placeholder="Tags"
            >
              <template #chip="{ value, removeCallback }">
                <span class="task-tag tag-multiselect-chip" :style="tagStyle(value)">
                  <span>{{ tagsById.get(value)?.name ?? value }}</span>
                  <button class="tag-chip-remove" type="button" aria-label="Remove tag" @click.stop="removeTagChip($event, removeCallback)">
                    <X :size="14" />
                  </button>
                </span>
              </template>
              <template #option="{ option }">
                <span class="task-tag" :style="{ '--tag-color': option.color ?? '#6b7280' }">{{ option.name }}</span>
              </template>
            </MultiSelect>
          </div>
        </div>
      </template>
    </Card>
    <template v-if="tab === 'overdue'">
      <section v-for="group in visibleGroups" :key="group.date" class="date-group">
        <h3 class="date-heading">Date: {{ group.date }}</h3>
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
  </AppShell>
</template>
