<script setup lang="ts">
import type { MainNavigationId } from "@its-personal/shared";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Sortable from "sortablejs";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { navigationItems, useSettingsStore } from "../stores/settings.js";

const settings = useSettingsStore();
const draft = ref<MainNavigationId[]>([...settings.mainNavigationOrder]);
const listEl = ref<HTMLElement | null>(null);
const saving = ref(false);
const saveError = ref("");
const discardVisible = ref(false);
let sortable: Sortable | null = null;
let resolveLeave: ((allow: boolean) => void) | null = null;

const draftItems = computed(() => draft.value.map((id) => navigationItems.find((item) => item.id === id)!));
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(settings.mainNavigationOrder));

function syncDraft() {
  if (!dirty.value) draft.value = [...settings.mainNavigationOrder];
}

function mountSortable() {
  sortable?.destroy();
  if (!listEl.value || settings.loadState !== "loaded") return;
  sortable = Sortable.create(listEl.value, {
    animation: 150,
    handle: ".main-nav-drag-handle",
    onEnd: (event) => {
      if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
      const next = [...draft.value];
      const [moved] = next.splice(event.oldIndex, 1);
      if (moved) next.splice(event.newIndex, 0, moved);
      draft.value = next;
    }
  });
}

function move(index: number, amount: -1 | 1) {
  const target = index + amount;
  if (target < 0 || target >= draft.value.length) return;
  const next = [...draft.value];
  [next[index], next[target]] = [next[target]!, next[index]!];
  draft.value = next;
}

async function save() {
  if (!dirty.value || saving.value || settings.loadState !== "loaded") return;
  saving.value = true;
  saveError.value = "";
  try {
    await settings.save(draft.value);
    draft.value = [...settings.mainNavigationOrder];
  } catch {
    saveError.value = "Could not save navigation order. Try again when the server is reachable.";
  } finally {
    saving.value = false;
  }
}

function settleLeave(allow: boolean) {
  const resolve = resolveLeave;
  resolveLeave = null;
  discardVisible.value = false;
  resolve?.(allow);
}

function discardVisibilityChanged(visible: boolean) {
  if (!visible) settleLeave(false);
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  discardVisible.value = true;
  return new Promise<boolean>((resolve) => { resolveLeave = resolve; });
});

watch(() => settings.mainNavigationOrder, syncDraft, { deep: true });
watch(() => settings.loadState, async (state) => {
  if (state === "loaded") {
    syncDraft();
    await nextTick();
    mountSortable();
  } else {
    sortable?.destroy();
    sortable = null;
  }
}, { immediate: true });

onMounted(() => {
  void settings.load();
  mountSortable();
});
onBeforeUnmount(() => sortable?.destroy());
</script>

<template>
  <section>
    <h3>Main Navi</h3>
    <Message v-if="settings.error" severity="warn">{{ settings.error }}</Message>
    <Message v-if="saveError" severity="error">{{ saveError }}</Message>
    <div ref="listEl" class="main-nav-list">
      <div v-for="(item, index) in draftItems" :key="item.id" class="main-nav-item">
        <span class="main-nav-drag-handle" aria-hidden="true">⠿</span>
        <span class="main-nav-label">{{ item.label }}</span>
        <Button icon="pi pi-arrow-up" text :disabled="index === 0 || settings.loadState !== 'loaded'" :aria-label="`Move ${item.label} up`" @click="move(index, -1)" />
        <Button icon="pi pi-arrow-down" text :disabled="index === draftItems.length - 1 || settings.loadState !== 'loaded'" :aria-label="`Move ${item.label} down`" @click="move(index, 1)" />
      </div>
    </div>
    <div class="dialog-actions">
      <Button label="Save" :disabled="!dirty || saving || settings.loadState !== 'loaded'" :loading="saving" @click="save" />
      <Button v-if="settings.loadState === 'error'" label="Retry" severity="secondary" outlined @click="settings.load(true)" />
    </div>
    <Dialog v-model:visible="discardVisible" modal header="Discard changes?" :style="{ width: 'min(420px, 92vw)' }" @update:visible="discardVisibilityChanged">
      <p>Your unsaved navigation order will be lost.</p>
      <div class="dialog-actions">
        <Button label="Stay" severity="secondary" text @click="settleLeave(false)" />
        <Button label="Discard" severity="danger" @click="settleLeave(true)" />
      </div>
    </Dialog>
  </section>
</template>
