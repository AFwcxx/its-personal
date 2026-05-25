<script setup lang="ts">
import type { Subtask } from "@its-personal/shared";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Textarea from "primevue/textarea";
import Sortable from "sortablejs";
import { GripVertical, Square, SquareCheck, Trash2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = defineProps<{ taskId: string; subtasks: Subtask[]; readonly?: boolean }>();
const planner = usePlannerStore();
const listEl = ref<HTMLElement | null>(null);
const pendingRemovalId = ref<string | null>(null);
const editingSubtaskId = ref<string | null>(null);
const editedTitle = ref("");
let sortable: Sortable | null = null;

const activeSubtasks = computed(() => props.subtasks.filter((subtask) => subtask.taskId === props.taskId && subtask.deletedAt === null));
const sortedSubtasks = computed(() => [...activeSubtasks.value].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)));
const sortableSignature = computed(() => `${props.readonly ? "readonly" : "editable"}:${sortedSubtasks.value.map((subtask) => subtask.id).join(",")}`);
const editingSubtask = computed(() => sortedSubtasks.value.find((subtask) => subtask.id === editingSubtaskId.value && subtask.completedAt === null) ?? null);
const pendingRemoval = computed(() => sortedSubtasks.value.find((subtask) => subtask.id === pendingRemovalId.value) ?? null);
const canUpdateSubtask = computed(() => Boolean(editingSubtask.value && editedTitle.value.trim()));

function hasTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function destroySortable() {
  sortable?.destroy();
  sortable = null;
}

function orderedSubtasksFromDom() {
  if (!listEl.value) return sortedSubtasks.value;
  const byId = new Map(sortedSubtasks.value.map((subtask) => [subtask.id, subtask]));
  const ordered = Array.from(listEl.value.querySelectorAll<HTMLElement>(".subtask-row"))
    .map((row) => row.dataset.id)
    .map((id) => id ? byId.get(id) : undefined)
    .filter((subtask): subtask is Subtask => subtask !== undefined);
  return ordered.length === sortedSubtasks.value.length ? ordered : sortedSubtasks.value;
}

watch(
  sortableSignature,
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
        const reordered = orderedSubtasksFromDom();
        sortable?.sort(reordered.map((subtask) => subtask.id));
        planner.reorderSubtasks(reordered);
      }
    });
    sortable.sort(sortedSubtasks.value.map((subtask) => subtask.id));
  },
  { immediate: true }
);

watch(editingSubtask, (subtask) => {
  editedTitle.value = subtask?.title ?? "";
});

onBeforeUnmount(() => {
  destroySortable();
});

async function confirmRemove() {
  if (!pendingRemoval.value) return;
  const removedId = pendingRemoval.value.id;
  await planner.deleteSubtask(pendingRemoval.value.id);
  pendingRemovalId.value = null;
  if (editingSubtaskId.value === removedId) editingSubtaskId.value = null;
}

function openEdit(subtask: Subtask) {
  if (props.readonly || subtask.completedAt || hasTextSelection()) return;
  editingSubtaskId.value = subtask.id;
}

async function updateEditedSubtask() {
  if (!editingSubtask.value || !canUpdateSubtask.value) return;
  await planner.updateSubtask(editingSubtask.value.id, { title: editedTitle.value.trim() });
  editingSubtaskId.value = null;
}

function requestRemoveEditedSubtask() {
  if (!editingSubtask.value) return;
  pendingRemovalId.value = editingSubtask.value.id;
}
</script>

<template>
  <div v-if="sortedSubtasks.length > 0" ref="listEl" class="subtask-list">
    <div
      v-for="subtask in sortedSubtasks"
      :key="subtask.id"
      class="subtask-row"
      :class="{ 'subtask-row-complete': subtask.completedAt, 'subtask-row-editable': !readonly && !subtask.completedAt }"
      :data-id="subtask.id"
      @click="openEdit(subtask)"
    >
      <Button
        v-if="!readonly"
        class="subtask-drag-handle task-row-icon-button"
        title="Drag handle"
        aria-label="Drag handle"
        severity="secondary"
        text
        @click.stop
      >
        <GripVertical :size="18" />
      </Button>
      <span v-else class="task-row-spacer" aria-hidden="true" />
      <span class="subtask-title">
        <i
          v-if="planner.pendingEntityStates[subtask.id]"
          class="pi pi-exclamation-triangle pending-sync-icon"
          :class="{ 'pending-sync-icon-error': planner.pendingEntityStates[subtask.id] === 'failed' }"
          :title="planner.pendingEntityStates[subtask.id] === 'failed' ? 'Sync failed' : 'Pending sync'"
          aria-hidden="true"
        />
        {{ subtask.title }}
      </span>
      <div v-if="!readonly" class="row-actions">
        <Button
          v-if="subtask.completedAt"
          class="task-row-icon-button"
          title="Delete subtask"
          aria-label="Delete subtask"
          severity="danger"
          text
          @click.stop="pendingRemovalId = subtask.id"
        >
          <Trash2 :size="16" />
        </Button>
        <Button class="task-row-icon-button" title="Complete" aria-label="Complete" severity="secondary" text @click.stop="planner.toggleSubtask(subtask.id)">
          <SquareCheck v-if="subtask.completedAt" :size="18" />
          <Square v-else :size="18" />
        </Button>
      </div>
    </div>
  </div>
  <Dialog :visible="editingSubtask !== null" modal header="Edit subtask" :style="{ width: 'min(420px, 92vw)' }" @update:visible="editingSubtaskId = $event ? editingSubtaskId : null">
    <div class="dialog-form">
      <Textarea v-model="editedTitle" placeholder="Subtask" rows="2" auto-resize />
    </div>
    <div class="dialog-actions subtask-edit-actions">
      <Button class="task-row-icon-button" title="Delete" aria-label="Delete" severity="danger" text @click="requestRemoveEditedSubtask">
        <Trash2 :size="16" />
      </Button>
      <Button label="Update" :disabled="!canUpdateSubtask" @click="updateEditedSubtask" />
    </div>
  </Dialog>
  <Dialog :visible="pendingRemoval !== null" modal header="Delete subtask" :style="{ width: 'min(420px, 92vw)' }" @update:visible="pendingRemovalId = $event ? pendingRemovalId : null">
    <p v-if="pendingRemoval">Delete "{{ pendingRemoval.title }}"?</p>
    <div class="dialog-actions">
      <Button label="Confirm" severity="danger" @click="confirmRemove" />
    </div>
  </Dialog>
</template>
