<script setup lang="ts">
import type { Subtask } from "@its-personal/shared";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Sortable from "sortablejs";
import { GripVertical, Square, SquareCheck, Trash2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = defineProps<{ taskId: string; subtasks: Subtask[]; readonly?: boolean }>();
const planner = usePlannerStore();
const listEl = ref<HTMLElement | null>(null);
const pendingRemovalId = ref<string | null>(null);
const expandedIds = ref(new Set<string>());
const overflowingIds = ref(new Set<string>());
const titleEls = new Map<string, HTMLElement>();
const pointerStart = { x: 0, y: 0 };
let sortable: Sortable | null = null;

const activeSubtasks = computed(() => props.subtasks.filter((subtask) => subtask.taskId === props.taskId && subtask.deletedAt === null));
const sortedSubtasks = computed(() => [...activeSubtasks.value].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)));
const pendingRemoval = computed(() => sortedSubtasks.value.find((subtask) => subtask.id === pendingRemovalId.value) ?? null);

function isOverflowing(id: string) {
  return overflowingIds.value.has(id);
}

function isExpanded(id: string) {
  return expandedIds.value.has(id);
}

function setTitleEl(id: string, el: Element | null) {
  if (el instanceof HTMLElement) {
    titleEls.set(id, el);
    return;
  }
  titleEls.delete(id);
}

function measureOverflow() {
  const nextOverflowing = new Set<string>();
  for (const subtask of sortedSubtasks.value) {
    const el = titleEls.get(subtask.id);
    if (!el) continue;
    if (expandedIds.value.has(subtask.id) || el.scrollWidth > el.clientWidth) {
      nextOverflowing.add(subtask.id);
    }
  }
  overflowingIds.value = nextOverflowing;
  expandedIds.value = new Set([...expandedIds.value].filter((id) => nextOverflowing.has(id)));
}

async function measureOverflowAfterRender() {
  await nextTick();
  measureOverflow();
}

function toggleExpanded(id: string) {
  if (!isOverflowing(id)) return;
  const nextExpanded = new Set(expandedIds.value);
  if (nextExpanded.has(id)) {
    nextExpanded.delete(id);
  } else {
    nextExpanded.add(id);
  }
  expandedIds.value = nextExpanded;
}

function hasTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function trackPointerStart(event: PointerEvent) {
  pointerStart.x = event.clientX;
  pointerStart.y = event.clientY;
}

function toggleExpandedFromPointer(id: string, event: PointerEvent) {
  const moved = Math.abs(event.clientX - pointerStart.x) > 4 || Math.abs(event.clientY - pointerStart.y) > 4;
  if (moved || hasTextSelection()) return;
  toggleExpanded(id);
}

function destroySortable() {
  sortable?.destroy();
  sortable = null;
}

watch(
  () => [props.readonly, sortedSubtasks.value.map((subtask) => subtask.id).join(",")],
  async () => {
    await nextTick();
    destroySortable();
    if (props.readonly || !listEl.value) return;
    sortable = Sortable.create(listEl.value, {
      animation: 150,
      handle: ".subtask-drag-handle",
      draggable: ".subtask-row",
      onEnd(event) {
        if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
        const reordered = [...sortedSubtasks.value];
        const [moved] = reordered.splice(event.oldIndex, 1);
        if (!moved) return;
        reordered.splice(event.newIndex, 0, moved);
        sortable?.sort(reordered.map((subtask) => subtask.id));
        planner.reorderSubtasks(reordered);
      }
    });
  },
  { immediate: true }
);

watch(
  () => sortedSubtasks.value.map((subtask) => `${subtask.id}:${subtask.title}`).join(","),
  measureOverflowAfterRender,
  { immediate: true }
);

onMounted(() => {
  window.addEventListener("resize", measureOverflow);
});

onBeforeUnmount(() => {
  destroySortable();
  window.removeEventListener("resize", measureOverflow);
});

async function confirmRemove() {
  if (!pendingRemoval.value) return;
  await planner.deleteSubtask(pendingRemoval.value.id);
  pendingRemovalId.value = null;
}
</script>

<template>
  <div v-if="sortedSubtasks.length > 0" ref="listEl" class="subtask-list">
    <div
      v-for="subtask in sortedSubtasks"
      :key="subtask.id"
      class="subtask-row"
      :class="{ 'subtask-row-complete': subtask.completedAt }"
      :data-id="subtask.id"
    >
      <Button
        v-if="!readonly"
        class="subtask-drag-handle task-row-icon-button"
        title="Drag handle"
        aria-label="Drag handle"
        severity="secondary"
        text
      >
        <GripVertical :size="18" />
      </Button>
      <span v-else class="task-row-spacer" aria-hidden="true" />
      <button
        class="subtask-title subtask-title-toggle"
        :class="{ 'subtask-title-expanded': isExpanded(subtask.id) }"
        type="button"
        :disabled="!isOverflowing(subtask.id)"
        :aria-expanded="isOverflowing(subtask.id) ? isExpanded(subtask.id) : undefined"
        :ref="(el) => setTitleEl(subtask.id, el as Element | null)"
        @pointerdown="trackPointerStart"
        @click="toggleExpandedFromPointer(subtask.id, $event as PointerEvent)"
      >
        {{ subtask.title }}
      </button>
      <div v-if="!readonly" class="row-actions">
        <Button class="task-row-icon-button" title="Delete" aria-label="Delete" severity="secondary" text @click="pendingRemovalId = subtask.id">
          <Trash2 :size="16" />
        </Button>
        <Button class="task-row-icon-button" title="Complete" aria-label="Complete" severity="secondary" text @click="planner.toggleSubtask(subtask.id)">
          <SquareCheck v-if="subtask.completedAt" :size="18" />
          <Square v-else :size="18" />
        </Button>
      </div>
    </div>
  </div>
  <Dialog :visible="pendingRemoval !== null" modal header="Delete subtask" :style="{ width: 'min(420px, 92vw)' }" @update:visible="pendingRemovalId = $event ? pendingRemovalId : null">
    <p v-if="pendingRemoval">Delete "{{ pendingRemoval.title }}"?</p>
    <div class="dialog-actions">
      <Button label="Confirm" severity="danger" @click="confirmRemove" />
    </div>
  </Dialog>
</template>
