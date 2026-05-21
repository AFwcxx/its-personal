<script setup lang="ts">
import type { Subtask } from "@its-personal/shared";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Sortable from "sortablejs";
import { GripVertical, Square, SquareCheck, Trash2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = defineProps<{ taskId: string; subtasks: Subtask[]; readonly?: boolean }>();
const planner = usePlannerStore();
const listEl = ref<HTMLElement | null>(null);
const pendingRemovalId = ref<string | null>(null);
let sortable: Sortable | null = null;

const activeSubtasks = computed(() => props.subtasks.filter((subtask) => subtask.taskId === props.taskId && subtask.deletedAt === null));
const sortedSubtasks = computed(() => [...activeSubtasks.value].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)));
const pendingRemoval = computed(() => sortedSubtasks.value.find((subtask) => subtask.id === pendingRemovalId.value) ?? null);

function destroySortable() {
  sortable?.destroy();
  sortable = null;
}

watch(
  () => [props.readonly, sortedSubtasks.value.map((subtask) => subtask.id).join(",")],
  async () => {
    await nextTick();
    destroySortable();
    if (props.readonly || !listEl.value) return;
    sortable = Sortable.create(listEl.value, {
      animation: 150,
      handle: ".subtask-drag-handle",
      draggable: ".subtask-row",
      onEnd(event) {
        if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
        const reordered = [...sortedSubtasks.value];
        const [moved] = reordered.splice(event.oldIndex, 1);
        if (!moved) return;
        reordered.splice(event.newIndex, 0, moved);
        sortable?.sort(reordered.map((subtask) => subtask.id));
        planner.reorderSubtasks(reordered);
      }
    });
  },
  { immediate: true }
);

onBeforeUnmount(destroySortable);

async function confirmRemove() {
  if (!pendingRemoval.value) return;
  await planner.deleteSubtask(pendingRemoval.value.id);
  pendingRemovalId.value = null;
}
</script>

<template>
  <div v-if="sortedSubtasks.length > 0" ref="listEl" class="subtask-list">
    <div
      v-for="subtask in sortedSubtasks"
      :key="subtask.id"
      class="subtask-row"
      :class="{ 'subtask-row-complete': subtask.completedAt }"
      :data-id="subtask.id"
    >
      <Button
        v-if="!readonly"
        class="subtask-drag-handle task-row-icon-button"
        title="Drag handle"
        aria-label="Drag handle"
        severity="secondary"
        text
      >
        <GripVertical :size="18" />
      </Button>
      <span v-else class="task-row-spacer" aria-hidden="true" />
      <span class="subtask-title">{{ subtask.title }}</span>
      <div v-if="!readonly" class="row-actions">
        <Button class="task-row-icon-button" title="Delete" aria-label="Delete" severity="secondary" text @click="pendingRemovalId = subtask.id">
          <Trash2 :size="16" />
        </Button>
        <Button class="task-row-icon-button" title="Complete" aria-label="Complete" severity="secondary" text @click="planner.toggleSubtask(subtask.id)">
          <SquareCheck v-if="subtask.completedAt" :size="18" />
          <Square v-else :size="18" />
        </Button>
      </div>
    </div>
  </div>
  <Dialog :visible="pendingRemoval !== null" modal header="Delete subtask" :style="{ width: 'min(420px, 92vw)' }" @update:visible="pendingRemovalId = $event ? pendingRemovalId : null">
    <p v-if="pendingRemoval">Delete "{{ pendingRemoval.title }}"?</p>
    <div class="dialog-actions">
      <Button label="Confirm" severity="danger" @click="confirmRemove" />
    </div>
  </Dialog>
</template>
