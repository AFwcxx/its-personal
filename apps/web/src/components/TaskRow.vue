<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import { GripVertical, Pin, Square, SquareCheck } from "lucide-vue-next";
import { usePlannerStore } from "../stores/planner.js";

defineProps<{ task: Task }>();
const planner = usePlannerStore();
</script>

<template>
  <div class="task-row" :class="{ pinned: task.pinned }" @click="planner.selectedTaskId = task.id">
    <button title="Drag handle" aria-label="Drag handle"><GripVertical :size="18" /></button>
    <div>
      <strong>{{ task.title }}</strong>
      <div class="muted">{{ task.dueDate || "No date" }}</div>
    </div>
    <div class="row-actions">
      <button title="Pin" aria-label="Pin" @click.stop="planner.updateTask(task.id, { pinned: !task.pinned })"><Pin :size="16" /></button>
      <button title="Complete" aria-label="Complete" @click.stop="planner.completeTask(task.id)">
        <SquareCheck v-if="task.completedAt" :size="18" />
        <Square v-else :size="18" />
      </button>
    </div>
  </div>
</template>
