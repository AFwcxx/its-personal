<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import Button from "primevue/button";
import { ChevronDown, ChevronRight, GripVertical, Pin, Square, SquareCheck } from "lucide-vue-next";
import { computed } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = defineProps<{ task: Task; draggable?: boolean; readonly?: boolean; hidePin?: boolean; canCollapseSubtasks?: boolean }>();
const planner = usePlannerStore();
const isSelected = computed(() => planner.selectedTaskId === props.task.id);
const isRecurring = computed(() => props.task.recurrence.type !== "none");
const pendingState = computed(() => planner.pendingEntityStates[props.task.id] ?? null);
const tags = computed(() => {
  const ids = props.task.tagIds ?? (props.task.tagId ? [props.task.tagId] : []);
  return ids
    .map((id) => planner.tags.find((tag) => tag.id === id && !tag.deletedAt))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
});

async function toggleCompleted() {
  if (props.task.completedAt) {
    await planner.updateTask(props.task.id, { completedAt: null });
    return;
  }
  await planner.completeTask(props.task.id);
}

async function toggleSubtasksCollapsed() {
  await planner.setSubtasksCollapsed(props.task.id, !props.task.subtasksCollapsed);
}
</script>

<template>
  <div class="task-row" :class="{ 'task-row-active': isSelected }" @click="planner.selectedTaskId = task.id">
    <Button v-if="draggable" class="drag-handle task-row-icon-button" title="Drag handle" aria-label="Drag handle" severity="secondary" text @click.stop>
      <GripVertical :size="18" />
    </Button>
    <span v-else class="task-row-spacer" aria-hidden="true" />
    <div>
      <strong class="task-title">
        <i
          v-if="pendingState"
          class="pi pi-exclamation-triangle pending-sync-icon"
          :class="{ 'pending-sync-icon-error': pendingState === 'failed' }"
          :title="pendingState === 'failed' ? 'Sync failed, will retry' : 'Pending sync'"
          aria-hidden="true"
        />
        <i v-if="isRecurring" class="pi pi-replay task-recurrence-icon" aria-hidden="true" />
        <span>{{ task.title }}</span>
      </strong>
      <div class="task-tags">
        <span v-for="tag in tags" :key="tag.id" class="task-tag" :style="{ '--tag-color': tag.color ?? '#6b7280' }">{{ tag.name }}</span>
        <span v-if="tags.length === 0" class="muted">No tags</span>
      </div>
    </div>
    <div v-if="canCollapseSubtasks || !readonly" class="row-actions">
      <Button
        v-if="canCollapseSubtasks"
        class="task-row-icon-button"
        :title="task.subtasksCollapsed ? 'Expand subtasks' : 'Collapse subtasks'"
        :aria-label="task.subtasksCollapsed ? 'Expand subtasks' : 'Collapse subtasks'"
        :aria-expanded="!task.subtasksCollapsed"
        severity="secondary"
        text
        @click.stop="toggleSubtasksCollapsed"
      >
        <ChevronRight v-if="task.subtasksCollapsed" :size="18" />
        <ChevronDown v-else :size="18" />
      </Button>
      <Button v-if="!readonly && !hidePin" class="task-row-icon-button" title="Pin" aria-label="Pin" severity="secondary" text @click.stop="planner.updateTask(task.id, { pinned: !task.pinned })">
        <Pin :size="16" :fill="task.pinned ? 'currentColor' : 'none'" />
      </Button>
      <Button v-if="!readonly" class="task-row-icon-button" title="Complete" aria-label="Complete" severity="secondary" text @click.stop="toggleCompleted">
        <SquareCheck v-if="task.completedAt" :size="18" />
        <Square v-else :size="18" />
      </Button>
    </div>
  </div>
</template>
