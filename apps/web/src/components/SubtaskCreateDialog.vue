<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { computed, ref, watch } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const subtaskTitle = ref("");
const parentTask = computed(() => planner.tasks.find((task) => task.id === planner.subtaskDialogTaskId) ?? null);
const visible = computed(() => planner.subtaskDialogTaskId !== null);
const canAddSubtask = computed(() => Boolean(parentTask.value && parentTask.value.completedAt === null && parentTask.value.deletedAt === null));

watch(visible, (isVisible) => {
  if (!isVisible) subtaskTitle.value = "";
});

function close() {
  planner.subtaskDialogTaskId = null;
}

async function addSubtask(closeAfterAdd = false) {
  if (!parentTask.value || !subtaskTitle.value.trim() || !canAddSubtask.value) return;
  await planner.createSubtask(parentTask.value.id, subtaskTitle.value.trim());
  subtaskTitle.value = "";
  if (closeAfterAdd) close();
}
</script>

<template>
  <Dialog :visible="visible" modal header="Add subtask" :style="{ width: 'min(420px, 92vw)' }" @update:visible="planner.subtaskDialogTaskId = $event ? planner.subtaskDialogTaskId : null">
    <div class="dialog-form">
      <InputText v-model="subtaskTitle" placeholder="New subtask" autofocus @keydown.enter.prevent="addSubtask(false)" />
    </div>
    <div class="dialog-actions">
      <Button label="Add" @click="addSubtask(false)" />
      <Button class="subtask-add-close-button" label="Add & Close" @click="addSubtask(true)" />
    </div>
  </Dialog>
</template>
