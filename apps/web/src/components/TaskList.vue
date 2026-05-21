<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import Sortable from "sortablejs";
import { computed, nextTick, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from "vue";
import { usePlannerStore } from "../stores/planner.js";
import SubtaskList from "./SubtaskList.vue";
import TaskRow from "./TaskRow.vue";

const props = defineProps<{ tasks: Task[]; reorderable?: boolean; readonly?: boolean; hidePin?: boolean }>();
const emit = defineEmits<{ reorder: [tasks: Task[]] }>();
const planner = usePlannerStore();

const listEl = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

const childTasks = computed(() => props.tasks.filter((task) => task.parentId !== null));
const rootTasks = computed(() => {
  const ids = new Set(props.tasks.map((task) => task.id));
  return props.tasks.filter((task) => task.parentId === null || !ids.has(task.parentId));
});

function childrenFor(task: Task) {
  return childTasks.value.filter((child) => child.parentId === task.id);
}

function pinnedFirst(tasks: Task[]) {
  return [
    ...tasks.filter((task) => task.pinned),
    ...tasks.filter((task) => !task.pinned)
  ];
}

function setListEl(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    listEl.value = el;
    return;
  }
  const component = el as ComponentPublicInstance | null;
  listEl.value = component?.$el instanceof HTMLElement ? component.$el : null;
}

function destroySortable() {
  sortable?.destroy();
  sortable = null;
}

watch(
  () => [props.reorderable, rootTasks.value.map((task) => task.id).join(",")],
  async () => {
    await nextTick();
    destroySortable();
    if (!props.reorderable || !listEl.value) return;
    sortable = Sortable.create(listEl.value, {
      animation: 150,
      handle: ".drag-handle",
      draggable: ".task-group",
      onEnd(event) {
        if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
        const reordered = [...rootTasks.value];
        const [moved] = reordered.splice(event.oldIndex, 1);
        if (!moved) return;
        reordered.splice(event.newIndex, 0, moved);
        const normalized = pinnedFirst(reordered);
        sortable?.sort(normalized.map((task) => task.id));
        emit("reorder", normalized);
      }
    });
  },
  { immediate: true }
);

onBeforeUnmount(destroySortable);
</script>

<template>
  <TransitionGroup :ref="setListEl" name="task-completion-fade" tag="div" class="task-list">
    <div v-for="task in rootTasks" :key="task.id" class="task-group" :data-id="task.id">
      <TaskRow :task="task" :draggable="Boolean(reorderable)" :readonly="Boolean(readonly)" :hide-pin="Boolean(hidePin)" />
      <SubtaskList :task-id="task.id" :subtasks="planner.subtasks" :readonly="Boolean(readonly)" />
      <div v-if="childrenFor(task).length > 0" class="subtask-list">
        <TaskRow v-for="child in childrenFor(task)" :key="child.id" :task="child" :readonly="Boolean(readonly)" :hide-pin="Boolean(hidePin)" />
      </div>
    </div>
  </TransitionGroup>
  <p v-if="tasks.length === 0" class="muted">No tasks.</p>
</template>
