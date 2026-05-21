<script setup lang="ts">
import Button from "primevue/button";
import FileUpload from "primevue/fileupload";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import type { Recurrence } from "@its-personal/shared";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { openAttachment, uploadAttachment, plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const title = ref("");
const notes = ref("");
const selectedTagIds = ref<string[]>([]);
const linkUrl = ref("");
const customIntervalDays = ref(1);
let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
const recurrenceOptions = [
  { label: "None", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Every N days", value: "every_n_days" }
];

const task = computed(() => planner.selectedTask);
const taskLinks = computed(() => planner.links.filter((link) => link.taskId === task.value?.id && !link.deletedAt));
const taskAttachments = computed(() => planner.attachments.filter((attachment) => attachment.taskId === task.value?.id && !attachment.deletedAt));
const tagOptions = computed(() => planner.activeTags);

watch(task, (value) => {
  title.value = value?.title ?? "";
  notes.value = value?.notes ?? "";
  selectedTagIds.value = value?.tagIds ?? (value?.tagId ? [value.tagId] : []);
  customIntervalDays.value = value?.recurrence.type === "every_n_days" ? value.recurrence.intervalDays : 1;
}, { immediate: true });

watch(notes, (value) => {
  if (!task.value || value === task.value.notes) return;
  if (notesSaveTimer) clearTimeout(notesSaveTimer);
  const taskId = task.value.id;
  notesSaveTimer = setTimeout(() => {
    planner.updateTask(taskId, { notes: value });
    notesSaveTimer = null;
  }, 500);
});

onBeforeUnmount(() => {
  if (notesSaveTimer) clearTimeout(notesSaveTimer);
  if (task.value && notes.value !== task.value.notes) {
    planner.updateTask(task.value.id, { notes: notes.value });
  }
});

async function save() {
  if (!task.value) return;
  await planner.updateTask(task.value.id, { title: title.value, notes: notes.value });
}

async function assignTags(tagIds: string[]) {
  selectedTagIds.value = tagIds;
  const currentTagIds = task.value?.tagIds ?? (task.value?.tagId ? [task.value.tagId] : []);
  if (!task.value || currentTagIds.join(",") === tagIds.join(",")) return;
  await planner.updateTask(task.value.id, { tagIds });
}

async function updateRecurrence(type: Recurrence["type"]) {
  if (!task.value) return;
  const recurrence: Recurrence = type === "every_n_days"
    ? { type, intervalDays: customIntervalDays.value }
    : { type };
  await planner.updateTask(task.value.id, { recurrence });
}

async function updateCustomIntervalDays(value: string) {
  customIntervalDays.value = Math.min(3660, Math.max(1, Number.parseInt(value, 10) || 1));
  if (task.value?.recurrence.type === "every_n_days") {
    await planner.updateTask(task.value.id, { recurrence: { type: "every_n_days", intervalDays: customIntervalDays.value } });
  }
}

async function addLink() {
  if (!task.value || !linkUrl.value.trim()) return;
  planner.links.push(await plannerApi.createLink({ taskId: task.value.id, url: linkUrl.value.trim() }));
  linkUrl.value = "";
}

async function addFile(event: { files: File[] }) {
  if (!task.value) return;
  const file = event.files[0];
  if (!file) return;
  planner.attachments.push(await uploadAttachment(task.value.id, file));
}

async function openTaskAttachment(id: string) {
  await openAttachment(id);
}
</script>

<template>
  <aside v-if="task" class="detail">
    <div class="toolbar">
      <h2>{{ task.title }}</h2>
      <Button aria-label="Close" severity="secondary" text @click="planner.selectedTaskId = null"><X :size="18" /></Button>
    </div>
    <div class="field-stack">
      <label>Title<Textarea v-model="title" rows="2" auto-resize /></label>
      <label>Due date<InputText :value="task.dueDate" type="date" @change="planner.updateTask(task.id, { dueDate: ($event.target as HTMLInputElement).value })" /></label>
      <label>Notes<Textarea v-model="notes" rows="5" /></label>
      <label>Recurrence
        <Select
          :model-value="task.recurrence.type"
          :options="recurrenceOptions"
          option-label="label"
          option-value="value"
          @update:model-value="updateRecurrence"
        />
      </label>
      <label v-if="task.recurrence.type === 'every_n_days'">Interval days
        <InputText
          :model-value="String(customIntervalDays)"
          aria-label="Custom recurrence interval days"
          inputmode="numeric"
          type="number"
          min="1"
          max="3660"
          @change="updateCustomIntervalDays(($event.target as HTMLInputElement).value)"
        />
      </label>
      <Button label="Save" @click="save" />
      <label>Add tag
        <MultiSelect
          v-model="selectedTagIds"
          :options="tagOptions"
          option-label="name"
          option-value="id"
          display="chip"
          @update:model-value="assignTags"
        />
      </label>
      <label>Add link<InputText v-model="linkUrl" placeholder="https://example.com" @keydown.enter.prevent="addLink" /></label>
      <Button label="Add Link" @click="addLink" />
      <ul>
        <li v-for="link in taskLinks" :key="link.id"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.url }}</a></li>
      </ul>
      <label>Attachment<FileUpload class="attachment-upload" mode="basic" custom-upload auto choose-label="Choose File" @select="addFile" /></label>
      <ul>
        <li v-for="attachment in taskAttachments" :key="attachment.id">
          <a class="attachment-link" href="#" @click.prevent="openTaskAttachment(attachment.id)">{{ attachment.originalName }}</a>
        </li>
      </ul>
    </div>
  </aside>
</template>
