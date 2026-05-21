<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { uploadAttachment, plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const title = ref("");
const notes = ref("");
const tagName = ref("");
const linkUrl = ref("");

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

async function addFile(event: Event) {
  if (!task.value) return;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  planner.attachments.push(await uploadAttachment(task.value.id, file));
}
</script>

<template>
  <aside v-if="task" class="detail">
    <div class="toolbar">
      <h2>{{ task.title }}</h2>
      <button aria-label="Close" @click="planner.selectedTaskId = null"><X :size="18" /></button>
    </div>
    <div class="field-stack">
      <label>Title<input v-model="title" /></label>
      <label>Due date<input :value="task.dueDate" type="date" @change="planner.updateTask(task.id, { dueDate: ($event.target as HTMLInputElement).value })" /></label>
      <label>Notes<textarea v-model="notes" rows="5" /></label>
      <label>Recurrence
        <select :value="task.recurrence.type" @change="planner.updateTask(task.id, { recurrence: { type: ($event.target as HTMLSelectElement).value as any } })">
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </label>
      <button @click="save">Save</button>
      <label>Add tag<input v-model="tagName" @keydown.enter.prevent="addTag" /></label>
      <button @click="addTag">Add Tag</button>
      <label>Add link<input v-model="linkUrl" placeholder="https://example.com" @keydown.enter.prevent="addLink" /></label>
      <button @click="addLink">Add Link</button>
      <ul>
        <li v-for="link in taskLinks" :key="link.id"><a :href="link.url" target="_blank" rel="noreferrer">{{ link.url }}</a></li>
      </ul>
      <label>Attachment<input type="file" @change="addFile" /></label>
      <ul>
        <li v-for="attachment in taskAttachments" :key="attachment.id">
          <a :href="`/api/attachments/${attachment.id}`">{{ attachment.originalName }}</a>
        </li>
      </ul>
    </div>
  </aside>
</template>
