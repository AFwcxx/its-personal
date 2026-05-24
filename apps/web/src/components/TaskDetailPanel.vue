<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import FileUpload from "primevue/fileupload";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import type { Recurrence, RecurrenceEnd } from "@its-personal/shared";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { openAttachment, uploadAttachment, plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const title = ref("");
const dueDate = ref("");
const notes = ref("");
const selectedTagIds = ref<string[]>([]);
const linkUrl = ref("");
const customIntervalDays = ref(1);
const recurrenceEnds = ref<RecurrenceEnd>({ type: "eternity" });
const taskPendingRemoval = ref(false);
let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
let syncedTaskId: string | null = null;
const recurrenceOptions = [
  { label: "None", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Every N days", value: "every_n_days" }
];
const recurrenceEndOptions = [
  { label: "Eternity", value: "eternity" },
  { label: "On date", value: "date" }
];

const task = computed(() => planner.selectedTask);
const taskLinks = computed(() => planner.links.filter((link) => link.taskId === task.value?.id && !link.deletedAt));
const taskAttachments = computed(() => planner.attachments.filter((attachment) => attachment.taskId === task.value?.id && !attachment.deletedAt));
const tagOptions = computed(() => planner.activeTags);
const canAddSubtask = computed(() => Boolean(task.value && task.value.completedAt === null && task.value.deletedAt === null));
const tagsById = computed(() => new Map(planner.activeTags.map((tag) => [tag.id, tag])));

watch(task, (value) => {
  const changedTask = value?.id !== syncedTaskId;
  syncedTaskId = value?.id ?? null;
  title.value = value?.title ?? "";
  dueDate.value = value?.dueDate ?? "";
  notes.value = value?.notes ?? "";
  selectedTagIds.value = value?.tagIds ?? (value?.tagId ? [value.tagId] : []);
  if (value?.recurrence.type === "every_n_days") {
    customIntervalDays.value = value.recurrence.intervalDays;
    recurrenceEnds.value = value.recurrence.ends;
  } else if (value?.recurrence.type && value.recurrence.type !== "none") {
    recurrenceEnds.value = value.recurrence.ends;
  } else if (changedTask) {
    customIntervalDays.value = 1;
    recurrenceEnds.value = { type: "eternity" };
  }
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
  await planner.updateTask(task.value.id, { title: title.value, dueDate: dueDate.value || task.value.dueDate, notes: notes.value });
}

async function assignTags(tagIds: string[]) {
  selectedTagIds.value = tagIds;
  const currentTagIds = task.value?.tagIds ?? (task.value?.tagId ? [task.value.tagId] : []);
  if (!task.value || currentTagIds.join(",") === tagIds.join(",")) return;
  await planner.updateTask(task.value.id, { tagIds });
}

function tagStyle(tagId: string) {
  return { "--tag-color": tagsById.value.get(tagId)?.color ?? "#6b7280" };
}

function removeTagChip(event: MouseEvent, removeCallback: (event: Event, item?: unknown) => void) {
  removeCallback(event);
}

async function updateRecurrence(type: Recurrence["type"]) {
  if (!task.value) return;
  const recurrence: Recurrence = type === "every_n_days"
    ? { type, intervalDays: customIntervalDays.value, ends: recurrenceEnds.value }
    : type === "none"
      ? { type }
      : { type, ends: recurrenceEnds.value };
  await planner.updateTask(task.value.id, { recurrence });
}

async function updateCustomIntervalDays(value: string) {
  customIntervalDays.value = Math.min(3660, Math.max(1, Number.parseInt(value, 10) || 1));
  if (task.value?.recurrence.type === "every_n_days") {
    await planner.updateTask(task.value.id, { recurrence: { type: "every_n_days", intervalDays: customIntervalDays.value, ends: recurrenceEnds.value } });
  }
}

async function updateRecurrenceEndType(type: RecurrenceEnd["type"]) {
  if (!task.value || task.value.recurrence.type === "none") return;
  recurrenceEnds.value = type === "date"
    ? { type, date: task.value.dueDate }
    : { type };
  await updateRecurrence(task.value.recurrence.type);
}

async function updateRecurrenceEndDate(date: string) {
  if (!task.value || task.value.recurrence.type === "none" || !date || date < task.value.dueDate) return;
  recurrenceEnds.value = { type: "date", date };
  await updateRecurrence(task.value.recurrence.type);
}

function updateDueDate(value: string | undefined) {
  dueDate.value = value ?? "";
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

async function confirmRemove() {
  if (!task.value) return;
  await planner.deleteTask(task.value.id);
  taskPendingRemoval.value = false;
  planner.selectedTaskId = null;
}

function openSubtaskDialog() {
  if (!task.value || !canAddSubtask.value) return;
  planner.subtaskDialogTaskId = task.value.id;
  planner.selectedTaskId = null;
}
</script>

<template>
  <aside v-if="task" class="detail">
    <div class="toolbar">
      <h2>{{ task.title }}</h2>
      <Button class="detail-close-button" aria-label="Close" severity="secondary" text @click="planner.selectedTaskId = null"><X :size="18" /></Button>
    </div>
    <Button v-if="canAddSubtask" class="detail-add-subtask-button" label="Add subtask" @click="openSubtaskDialog" />
    <div class="field-stack">
      <label>Title<Textarea v-model="title" rows="2" auto-resize /></label>
      <label>Due date<InputText :model-value="dueDate" type="date" :disabled="task.recurrence.type !== 'none' && recurrenceEnds.type === 'date'" @update:model-value="updateDueDate" /></label>
      <label>Notes<Textarea v-model="notes" class="notes-textarea" rows="5" /></label>
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
      <label v-if="task.recurrence.type !== 'none'">Ends
        <Select
          :model-value="recurrenceEnds.type"
          :options="recurrenceEndOptions"
          option-label="label"
          option-value="value"
          @update:model-value="updateRecurrenceEndType"
        />
      </label>
      <label v-if="task.recurrence.type !== 'none' && recurrenceEnds.type === 'date'">End date
        <InputText
          :model-value="recurrenceEnds.date"
          aria-label="Recurrence end date"
          type="date"
          :min="task.dueDate"
          @change="updateRecurrenceEndDate(($event.target as HTMLInputElement).value)"
        />
      </label>
      <Button class="recurrence-save-button" label="Save" @click="save" />
      <label>Add tag
        <MultiSelect
          class="tag-multiselect"
          v-model="selectedTagIds"
          :options="tagOptions"
          option-label="name"
          option-value="id"
          display="chip"
          @update:model-value="assignTags"
        >
          <template #chip="{ value, removeCallback }">
            <span class="task-tag tag-multiselect-chip" :style="tagStyle(value)">
              <span>{{ tagsById.get(value)?.name ?? value }}</span>
              <button class="tag-chip-remove" type="button" aria-label="Remove tag" @click.stop="removeTagChip($event, removeCallback)">
                <X :size="14" />
              </button>
            </span>
          </template>
          <template #option="{ option }">
            <span class="task-tag" :style="{ '--tag-color': option.color ?? '#6b7280' }">{{ option.name }}</span>
          </template>
        </MultiSelect>
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
      <Button class="detail-delete-button" label="Delete task" severity="danger" @click="taskPendingRemoval = true" />
    </div>
    <Dialog :visible="taskPendingRemoval" modal header="Delete task" :style="{ width: 'min(420px, 92vw)' }" @update:visible="taskPendingRemoval = $event">
      <p>This task will be deleted.</p>
      <div class="dialog-actions">
        <Button label="Confirm" severity="danger" @click="confirmRemove" />
      </div>
    </Dialog>
  </aside>
</template>
