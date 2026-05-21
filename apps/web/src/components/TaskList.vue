<script setup lang="ts">
import type { Task } from "@its-personal/shared";
import TaskRow from "./TaskRow.vue";

defineProps<{ tasks: Task[] }>();
</script>

<template>
  <div class="task-list">
    <TaskRow v-for="task in tasks" :key="task.id" :task="task" />
    <p v-if="tasks.length === 0" class="muted">No tasks.</p>
  </div>
</template>
