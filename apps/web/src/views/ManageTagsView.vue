<script setup lang="ts">
import Button from "primevue/button";
import ColorPicker from "primevue/colorpicker";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const name = ref("");
const color = ref("6b7280");
const tagPendingRemoval = ref<string | null>(null);
onMounted(() => planner.refresh());

const pendingTag = computed(() => planner.activeTags.find((tag) => tag.id === tagPendingRemoval.value) ?? null);
const pendingTagTaskCount = computed(() => pendingTag.value ? taskCount(pendingTag.value.id) : 0);

async function createTag() {
  if (!name.value.trim()) return;
  planner.tags.push(await plannerApi.createTag({ name: name.value.trim(), color: `#${color.value}` }));
  name.value = "";
}

async function rename(id: string, value: string) {
  const tag = await plannerApi.updateTag(id, { name: value });
  planner.tags = planner.tags.map((candidate) => candidate.id === id ? tag : candidate);
}

async function recolor(id: string, value: string) {
  const tag = await plannerApi.updateTag(id, { color: `#${value}` });
  planner.tags = planner.tags.map((candidate) => candidate.id === id ? tag : candidate);
}

function taskCount(id: string) {
  return planner.tasks.filter((task) => task.tagId === id && task.deletedAt === null).length;
}

function requestRemove(id: string) {
  tagPendingRemoval.value = id;
}

async function confirmRemove() {
  const tag = pendingTag.value;
  if (!tag) return;
  const now = new Date().toISOString();
  if (pendingTagTaskCount.value > 0) {
    const archived = await plannerApi.updateTag(tag.id, { archivedAt: now });
    planner.tags = planner.tags.map((candidate) => candidate.id === tag.id ? archived : candidate);
  } else {
    await plannerApi.deleteTag(tag.id);
    planner.tags = planner.tags.filter((candidate) => candidate.id !== tag.id);
  }
  tagPendingRemoval.value = null;
}

function pickerColor(value: string | null) {
  return (value ?? "#6b7280").replace("#", "");
}
</script>

<template>
  <AppShell>
    <h2>Manage Tags</h2>
    <div class="toolbar">
      <InputText v-model="name" placeholder="New tag" @keydown.enter.prevent="createTag" />
      <ColorPicker v-model="color" input-id="new-tag-color" aria-label="New tag color" />
      <Button label="Add" @click="createTag" />
    </div>
    <div class="task-list">
      <div v-for="tag in planner.activeTags" :key="tag.id" class="tag-row">
        <span class="muted">{{ taskCount(tag.id) }}</span>
        <ColorPicker :model-value="pickerColor(tag.color)" :aria-label="`${tag.name} color`" @update:model-value="recolor(tag.id, $event)" />
        <InputText :value="tag.name" @change="rename(tag.id, ($event.target as HTMLInputElement).value)" />
        <Button label="Delete" severity="danger" @click="requestRemove(tag.id)" />
      </div>
    </div>
    <Dialog :visible="tagPendingRemoval !== null" modal header="Delete tag" :style="{ width: 'min(420px, 92vw)' }" @update:visible="tagPendingRemoval = $event ? tagPendingRemoval : null">
      <p v-if="pendingTagTaskCount > 0">
        This tag is assigned to {{ pendingTagTaskCount }} task{{ pendingTagTaskCount === 1 ? "" : "s" }}. It will be archived and hidden, but preserved in history.
      </p>
      <p v-else>This tag is not assigned to any task. It will be deleted.</p>
      <div class="dialog-actions">
        <Button label="Cancel" severity="secondary" @click="tagPendingRemoval = null" />
        <Button label="Confirm" severity="danger" @click="confirmRemove" />
      </div>
    </Dialog>
  </AppShell>
</template>
