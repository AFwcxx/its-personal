<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const name = ref("");
onMounted(() => planner.refresh());

async function createTag() {
  if (!name.value.trim()) return;
  planner.tags.push(await plannerApi.createTag({ name: name.value.trim() }));
  name.value = "";
}

async function rename(id: string, value: string) {
  const tag = await plannerApi.updateTag(id, { name: value });
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
      <button @click="createTag">Add</button>
    </div>
    <div class="task-list">
      <div v-for="tag in planner.activeTags" :key="tag.id" class="task-row">
        <span class="muted">{{ planner.tasks.filter((task) => task.tagId === tag.id).length }}</span>
        <input :value="tag.name" @change="rename(tag.id, ($event.target as HTMLInputElement).value)" />
        <button @click="remove(tag.id)">Delete</button>
      </div>
    </div>
  </AppShell>
</template>
