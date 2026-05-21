<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import Button from "primevue/button";
import { GripVertical, Pin, Square, SquareCheck } from "lucide-vue-next";
import { computed } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = defineProps<{ task: Task; draggable?: boolean; readonly?: boolean; hidePin?: boolean }>();
const planner = usePlannerStore();
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
</script>

<template>
  <div class="task-row" @click="planner.selectedTaskId = task.id">
    <Button v-if="draggable" class="drag-handle task-row-icon-button" title="Drag handle" aria-label="Drag handle" severity="secondary" text @click.stop>
      <GripVertical :size="18" />
    </Button>
    <span v-else class="task-row-spacer" aria-hidden="true" />
    <div>
      <strong>{{ task.title }}</strong>
      <div class="task-tags">
        <span v-for="tag in tags" :key="tag.id" class="task-tag" :style="{ '--tag-color': tag.color ?? '#6b7280' }">{{ tag.name }}</span>
        <span v-if="tags.length === 0" class="muted">No tags</span>
      </div>
    </div>
    <div v-if="!readonly" class="row-actions">
      <Button v-if="!hidePin" class="task-row-icon-button" title="Pin" aria-label="Pin" severity="secondary" text @click.stop="planner.updateTask(task.id, { pinned: !task.pinned })">
        <Pin :size="16" :fill="task.pinned ? 'currentColor' : 'none'" />
      </Button>
      <Button class="task-row-icon-button" title="Complete" aria-label="Complete" severity="secondary" text @click.stop="toggleCompleted">
        <SquareCheck v-if="task.completedAt" :size="18" />
        <Square v-else :size="18" />
      </Button>
    </div>
  </div>
</template>
