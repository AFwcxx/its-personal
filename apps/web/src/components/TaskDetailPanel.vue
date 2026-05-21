<script setup lang="ts">
import Button from "primevue/button";
import FileUpload from "primevue/fileupload";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Textarea from "primevue/textarea";
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { uploadAttachment, plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const title = ref("");
const notes = ref("");
const tagName = ref("");
const linkUrl = ref("");
const recurrenceOptions = [
  { label: "None", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" }
];

const task = computed(() => planner.selectedTask);
const taskLinks = computed(() => planner.links.filter((link) => link.taskId === task.value?.id && !link.deletedAt));
const taskAttachments = computed(() => planner.attachments.filter((attachment) => attachment.taskId === task.value?.id && !attachment.deletedAt));

watch(task, (value) => {
  title.value = value?.title ?? "";
  notes.value = value?.notes ?? "";
}, { immediate: true });

async function save() {
  if (!task.value) return;
  await planner.updateTask(task.value.id, { title: title.value, notes: notes.value });
}

async function addTag() {
  if (!task.value || !tagName.value.trim()) return;
  const tag = await plannerApi.createTag({ name: tagName.value.trim() });
  planner.tags.push(tag);
  await planner.updateTask(task.value.id, { tagId: tag.id });
  tagName.value = "";
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
</script>

<template>
  <aside v-if="task" class="detail">
    <div class="toolbar">
      <h2>{{ task.title }}</h2>
      <Button aria-label="Close" severity="secondary" text @click="planner.selectedTaskId = null"><X :size="18" /></Button>
    </div>
    <div class="field-stack">
      <label>Title<InputText v-model="title" /></label>
      <label>Due date<InputText :value="task.dueDate" type="date" @change="planner.updateTask(task.id, { dueDate: ($event.target as HTMLInputElement).value })" /></label>
      <label>Notes<Textarea v-model="notes" rows="5" /></label>
      <label>Recurrence
        <Select
          :model-value="task.recurrence.type"
          :options="recurrenceOptions"
          option-label="label"
          option-value="value"
          @update:model-value="planner.updateTask(task.id, { recurrence: { type: $event as any } })"
        />
      </label>
      <Button label="Save" @click="save" />
      <label>Add tag<InputText v-model="tagName" @keydown.enter.prevent="addTag" /></label>
      <Button label="Add Tag" @click="addTag" />
      <label>Add link<InputText v-model="linkUrl" placeholder="https://example.com" @keydown.enter.prevent="addLink" /></label>
      <Button label="Add Link" @click="addLink" />
      <ul>
        <li v-for="link in taskLinks" :key="link.id"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.url }}</a></li>
      </ul>
      <label>Attachment<FileUpload mode="basic" custom-upload auto choose-label="Choose File" @select="addFile" /></label>
      <ul>
        <li v-for="attachment in taskAttachments" :key="attachment.id">
          <a :href="`/api/attachments/${attachment.id}`">{{ attachment.originalName }}</a>
        </li>
      </ul>
    </div>
  </aside>
</template>
