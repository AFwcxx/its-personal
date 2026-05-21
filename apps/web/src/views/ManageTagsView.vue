<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const name = ref("");
const color = ref("#6b7280");
onMounted(() => planner.refresh());

async function createTag() {
  if (!name.value.trim()) return;
  planner.tags.push(await plannerApi.createTag({ name: name.value.trim(), color: color.value }));
  name.value = "";
}

async function rename(id: string, value: string) {
  const tag = await plannerApi.updateTag(id, { name: value });
  planner.tags = planner.tags.map((candidate) => candidate.id === id ? tag : candidate);
}

async function recolor(id: string, value: string) {
  const tag = await plannerApi.updateTag(id, { color: value });
  planner.tags = planner.tags.map((candidate) => candidate.id === id ? tag : candidate);
}

async function remove(id: string) {
  await plannerApi.deleteTag(id);
  planner.tags = planner.tags.filter((tag) => tag.id !== id);
}
</script>

<template>
  <AppShell>
    <h2>Manage Tags</h2>
    <div class="toolbar">
      <input v-model="name" placeholder="New tag" @keydown.enter.prevent="createTag" />
      <input v-model="color" class="color-input" type="color" aria-label="New tag color" />
      <button @click="createTag">Add</button>
    </div>
    <div class="task-list">
      <div v-for="tag in planner.activeTags" :key="tag.id" class="tag-row">
        <span class="muted">{{ planner.tasks.filter((task) => task.tagId === tag.id).length }}</span>
        <input class="color-input" type="color" :value="tag.color ?? '#6b7280'" :aria-label="`${tag.name} color`" @change="recolor(tag.id, ($event.target as HTMLInputElement).value)" />
        <input :value="tag.name" @change="rename(tag.id, ($event.target as HTMLInputElement).value)" />
        <button @click="remove(tag.id)">Delete</button>
      </div>
    </div>
  </AppShell>
</template>
