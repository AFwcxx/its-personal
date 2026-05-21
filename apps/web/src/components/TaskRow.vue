<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import Button from "primevue/button";
import { GripVertical, Pin, Square, SquareCheck } from "lucide-vue-next";
import { usePlannerStore } from "../stores/planner.js";

defineProps<{ task: Task; draggable?: boolean }>();
const planner = usePlannerStore();
</script>

<template>
  <div class="task-row" :class="{ pinned: task.pinned }" @click="planner.selectedTaskId = task.id">
    <Button v-if="draggable" class="drag-handle" title="Drag handle" aria-label="Drag handle" severity="secondary" text @click.stop>
      <GripVertical :size="18" />
    </Button>
    <span v-else class="task-row-spacer" aria-hidden="true" />
    <div>
      <strong>{{ task.title }}</strong>
      <div class="muted">{{ task.dueDate || "No date" }}</div>
    </div>
    <div class="row-actions">
      <Button title="Pin" aria-label="Pin" severity="secondary" text @click.stop="planner.updateTask(task.id, { pinned: !task.pinned })">
        <Pin :size="16" />
      </Button>
      <Button title="Complete" aria-label="Complete" severity="secondary" text @click.stop="planner.completeTask(task.id)">
        <SquareCheck v-if="task.completedAt" :size="18" />
        <Square v-else :size="18" />
      </Button>
    </div>
  </div>
</template>
