<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import Sortable from "sortablejs";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import TaskRow from "./TaskRow.vue";

const props = defineProps<{ tasks: Task[]; reorderable?: boolean; readonly?: boolean }>();
const emit = defineEmits<{ reorder: [tasks: Task[]] }>();

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
        emit("reorder", reordered);
      }
    });
  },
  { immediate: true }
);

onBeforeUnmount(destroySortable);
</script>

<template>
  <div ref="listEl" class="task-list">
    <div v-for="task in rootTasks" :key="task.id" class="task-group">
      <TaskRow :task="task" :draggable="Boolean(reorderable)" :readonly="Boolean(readonly)" />
      <div v-if="childrenFor(task).length > 0" class="subtask-list">
        <TaskRow v-for="child in childrenFor(task)" :key="child.id" :task="child" :readonly="Boolean(readonly)" />
      </div>
    </div>
    <p v-if="tasks.length === 0" class="muted">No tasks.</p>
  </div>
</template>
