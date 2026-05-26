<script setup lang="ts">
import type { Note, NoteContentStyle, NoteListItem } from "@its-personal/shared";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Textarea from "primevue/textarea";
import Sortable from "sortablejs";
import { GripVertical, Pin, Trash2, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from "vue";
import AppShell from "../components/AppShell.vue";
import { generateLocalId } from "../services/offline.js";
import { textToItems, useNotesStore, type EditableNote } from "../stores/notes.js";

const notes = useNotesStore();
const search = ref("");
const dialogVisible = ref(false);
const deleteDialogVisible = ref(false);
const editingId = ref<string | null>(null);
const title = ref("");
const content = ref("");
const contentStyle = ref<NoteContentStyle>("normal");
const items = ref<NoteListItem[]>([]);
const pinned = ref(false);
const selectedTagIds = ref<string[]>([]);
const pinnedListEl = ref<HTMLElement | null>(null);
const unpinnedListEl = ref<HTMLElement | null>(null);
let pinnedSortable: Sortable | null = null;
let unpinnedSortable: Sortable | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let layoutFrame: number | null = null;

const styleOptions: Array<{ label: string; value: NoteContentStyle }> = [
  { label: "Text", value: "normal" },
  { label: "Checklist", value: "checklist" },
  { label: "Ordered", value: "ordered" },
  { label: "Bullets", value: "unordered" }
];

const tagOptions = computed(() => notes.activeTags);
const tagsById = computed(() => new Map(notes.tags.map((tag) => [tag.id, tag])));
const filteredNotes = computed(() => {
  const q = search.value.trim().toLowerCase();
  const visible = notes.visibleNotes;
  const matched = q
    ? visible.filter((note) => `${note.title}\n${note.content}\n${note.items.map((item) => item.text).join("\n")}`.toLowerCase().includes(q))
    : visible;
  return [...matched].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || b.createdAt.localeCompare(a.createdAt));
});
const pinnedNotes = computed(() => filteredNotes.value.filter((note) => note.pinned));
const unpinnedNotes = computed(() => filteredNotes.value.filter((note) => !note.pinned));
const editingNote = computed(() => notes.notes.find((note) => note.id === editingId.value) ?? null);
const canSave = computed(() => title.value.trim().length > 0 || content.value.trim().length > 0 || items.value.some((item) => item.text.trim().length > 0));

onMounted(() => {
  void notes.refresh().finally(async () => {
    await nextTick();
    mountSortable();
    scheduleMasonryLayout();
  });
  window.addEventListener("resize", scheduleMasonryLayout);
  refreshTimer = setInterval(() => {
    void notes.refreshIfChanged().catch(() => undefined);
  }, 5_000);
});

onBeforeUnmount(() => {
  pinnedSortable?.destroy();
  unpinnedSortable?.destroy();
  window.removeEventListener("resize", scheduleMasonryLayout);
  if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
  if (refreshTimer) clearInterval(refreshTimer);
});

watch(
  () => [notesLayoutKey(pinnedNotes.value), notesLayoutKey(unpinnedNotes.value)],
  async () => {
    await nextTick();
    mountSortable();
    scheduleMasonryLayout();
  },
  { immediate: true, flush: "post" }
);

function setPinnedListEl(el: Element | ComponentPublicInstance | null) {
  pinnedListEl.value = elementFromRef(el);
}

function setUnpinnedListEl(el: Element | ComponentPublicInstance | null) {
  unpinnedListEl.value = elementFromRef(el);
}

function elementFromRef(el: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (el instanceof HTMLElement) return el;
  const component = el as ComponentPublicInstance | null;
  return component?.$el instanceof HTMLElement ? component.$el : null;
}

function mountSortable() {
  pinnedSortable?.destroy();
  unpinnedSortable?.destroy();
  pinnedSortable = createSortable(pinnedListEl.value, pinnedNotes.value);
  unpinnedSortable = createSortable(unpinnedListEl.value, unpinnedNotes.value);
}

function scheduleMasonryLayout() {
  if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = null;
    layoutNoteGrid(pinnedListEl.value);
    layoutNoteGrid(unpinnedListEl.value);
  });
}

function layoutNoteGrid(grid: HTMLElement | null) {
  if (!grid) return;
  const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 16;
  const gridWidth = grid.clientWidth;
  const targetCardWidth = window.matchMedia("(max-width: 640px)").matches ? gridWidth : 240;
  const columnCount = Math.max(1, Math.floor((gridWidth + gap) / (targetCardWidth + gap)));
  const cardWidth = columnCount === 1 ? gridWidth : targetCardWidth;
  const columnHeights = Array.from({ length: columnCount }, () => 0);

  for (const card of grid.querySelectorAll<HTMLElement>(".note-card")) {
    card.style.width = `${cardWidth}px`;
    card.style.left = "0";
    card.style.top = "0";
    card.style.removeProperty("grid-row-end");
  }

  for (const card of grid.querySelectorAll<HTMLElement>(".note-card")) {
    const columnIndex = shortestColumnIndex(columnHeights);
    const x = columnIndex * (cardWidth + gap);
    const y = columnHeights[columnIndex] ?? 0;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    const height = card.getBoundingClientRect().height;
    columnHeights[columnIndex] = y + height + gap;
  }
  grid.style.height = `${Math.max(0, ...columnHeights) - gap}px`;
}

function shortestColumnIndex(columnHeights: number[]) {
  return columnHeights.reduce((shortest, height, index) => height < columnHeights[shortest]! ? index : shortest, 0);
}

function notesLayoutKey(items: Note[]) {
  return items.map((note) => [
    note.id,
    note.title,
    note.content,
    note.contentStyle,
    note.items.map((item) => `${item.id}:${item.text}:${Boolean(item.checked)}`).join("|"),
    note.tagIds.join(","),
    note.order
  ].join("~")).join("::");
}

function createSortable(el: HTMLElement | null, source: Note[]) {
  if (!el || source.length < 2) return null;
  return Sortable.create(el, {
    animation: 150,
    handle: ".note-drag-handle",
    draggable: ".note-card",
    onEnd(event) {
      if (event.oldIndex === undefined || event.newIndex === undefined || event.oldIndex === event.newIndex) return;
      const reordered = [...source];
      const [moved] = reordered.splice(event.oldIndex, 1);
      if (!moved) return;
      reordered.splice(event.newIndex, 0, moved);
      void notes.reorderNotes(reordered);
    }
  });
}

function openCreateDialog() {
  editingId.value = null;
  title.value = "";
  content.value = "";
  contentStyle.value = "normal";
  items.value = [];
  pinned.value = false;
  selectedTagIds.value = [];
  dialogVisible.value = true;
}

function openEditDialog(note: Note) {
  editingId.value = note.id;
  title.value = note.title;
  content.value = note.contentStyle === "normal" ? note.content : note.items.map((item) => item.text).join("\n");
  contentStyle.value = note.contentStyle;
  items.value = note.items.map((item) => ({ ...item }));
  pinned.value = note.pinned;
  selectedTagIds.value = [...note.tagIds];
  dialogVisible.value = true;
}

function togglePinned() {
  pinned.value = !pinned.value;
}

function updateStyle(value: NoteContentStyle) {
  if (value === contentStyle.value) return;
  if (value === "normal") {
    content.value = contentStyle.value === "normal" ? content.value : items.value.map((item) => item.text).join("\n");
    items.value = [];
  } else {
    items.value = contentStyle.value === "normal" ? textToItems(content.value) : items.value.map((item) => ({ id: item.id, text: item.text, checked: value === "checklist" ? false : undefined }));
    content.value = "";
    if (items.value.length === 0) addListItem();
  }
  contentStyle.value = value;
}

function addListItem(index = items.value.length) {
  items.value.splice(index, 0, { id: generateLocalId("note_item"), text: "", checked: false });
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-note-item-id="${items.value[index]?.id}"]`);
    input?.focus();
  });
}

function blurListItem(index: number) {
  if (items.value.length <= 1) return;
  if (items.value[index]?.text.trim() === "") items.value.splice(index, 1);
}

function enterListItem(index: number) {
  addListItem(index + 1);
}

async function saveNote() {
  if (!canSave.value) return;
  const payload = notePayload();
  if (editingId.value) {
    await notes.updateNote(editingId.value, payload);
  } else {
    await notes.createNote(payload);
  }
  dialogVisible.value = false;
}

function notePayload(): EditableNote {
  const normalizedItems = contentStyle.value === "normal" ? [] : items.value.filter((item) => item.text.trim()).map((item) => ({
    id: item.id,
    text: item.text.trim(),
    checked: contentStyle.value === "checklist" ? Boolean(item.checked) : undefined
  }));
  return {
    title: title.value.trim(),
    content: contentStyle.value === "normal" ? content.value.trim() : normalizedItems.map((item) => item.text).join("\n"),
    contentStyle: contentStyle.value,
    items: normalizedItems,
    pinned: pinned.value,
    tagIds: selectedTagIds.value
  };
}

async function confirmDelete() {
  if (!editingId.value) return;
  await notes.deleteNote(editingId.value);
  deleteDialogVisible.value = false;
  dialogVisible.value = false;
}

function tagStyle(tagId: string) {
  return { "--tag-color": tagsById.value.get(tagId)?.color ?? "#6b7280" };
}

function formatModified(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
</script>

<template>
  <AppShell>
    <div class="toolbar notes-toolbar">
      <h2>Notes</h2>
      <Message v-if="notes.status === 'offline'" severity="warn" size="small">Offline changes will sync later</Message>
    </div>
    <div class="notes-actions">
      <Button label="Add" icon="pi pi-plus" @click="openCreateDialog" />
      <InputText v-model="search" class="notes-search" placeholder="Search notes" />
    </div>

    <p v-if="filteredNotes.length === 0" class="muted">No notes.</p>

    <section v-if="pinnedNotes.length > 0" class="notes-section">
      <h3>Pinned</h3>
      <div :ref="setPinnedListEl" class="notes-grid">
        <article v-for="note in pinnedNotes" :key="note.id" class="note-card" :data-id="note.id" @click="openEditDialog(note)">
          <button class="note-drag-handle" type="button" aria-label="Reorder note" @click.stop><GripVertical :size="16" /></button>
          <h3 v-if="note.title.trim()">{{ note.title }}</h3>
          <div class="note-card-content">
            <p v-if="note.contentStyle === 'normal'">{{ note.content }}</p>
            <ul v-else-if="note.contentStyle === 'checklist'" class="note-list note-checklist">
              <li v-for="item in note.items" :key="item.id">
                <Checkbox :model-value="Boolean(item.checked)" binary @click.stop @update:model-value="notes.toggleChecklistItem(note.id, item.id)" />
                <span :class="{ checked: item.checked }">{{ item.text }}</span>
              </li>
            </ul>
            <ol v-else-if="note.contentStyle === 'ordered'" class="note-list">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ol>
            <ul v-else class="note-list">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ul>
          </div>
          <div v-if="note.tagIds.length > 0" class="task-tags">
            <span v-for="tagId in note.tagIds" :key="tagId" class="task-tag" :style="tagStyle(tagId)">{{ tagsById.get(tagId)?.name ?? tagId }}</span>
          </div>
        </article>
      </div>
    </section>

    <section v-if="unpinnedNotes.length > 0" class="notes-section">
      <h3 v-if="pinnedNotes.length > 0">Notes</h3>
      <div :ref="setUnpinnedListEl" class="notes-grid">
        <article v-for="note in unpinnedNotes" :key="note.id" class="note-card" :data-id="note.id" @click="openEditDialog(note)">
          <button class="note-drag-handle" type="button" aria-label="Reorder note" @click.stop><GripVertical :size="16" /></button>
          <h3 v-if="note.title.trim()">{{ note.title }}</h3>
          <div class="note-card-content">
            <p v-if="note.contentStyle === 'normal'">{{ note.content }}</p>
            <ul v-else-if="note.contentStyle === 'checklist'" class="note-list note-checklist">
              <li v-for="item in note.items" :key="item.id">
                <Checkbox :model-value="Boolean(item.checked)" binary @click.stop @update:model-value="notes.toggleChecklistItem(note.id, item.id)" />
                <span :class="{ checked: item.checked }">{{ item.text }}</span>
              </li>
            </ul>
            <ol v-else-if="note.contentStyle === 'ordered'" class="note-list">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ol>
            <ul v-else class="note-list">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ul>
          </div>
          <div v-if="note.tagIds.length > 0" class="task-tags">
            <span v-for="tagId in note.tagIds" :key="tagId" class="task-tag" :style="tagStyle(tagId)">{{ tagsById.get(tagId)?.name ?? tagId }}</span>
          </div>
        </article>
      </div>
    </section>

    <Dialog v-model:visible="dialogVisible" modal :style="{ width: 'min(640px, 94vw)' }">
      <template #header>
        <div class="note-dialog-header">
          <button class="note-dialog-pin-button" :class="{ active: pinned }" type="button" :aria-label="pinned ? 'Unpin note' : 'Pin note'" @click="togglePinned">
            <Pin :size="20" :fill="pinned ? 'currentColor' : 'none'" />
          </button>
          <span>{{ editingId ? 'Edit note' : 'Add note' }}</span>
        </div>
      </template>
      <div class="note-dialog">
        <label>Title<InputText v-model="title" maxlength="500" /></label>
        <label v-if="contentStyle === 'normal'">Content<Textarea v-model="content" auto-resize rows="4" maxlength="20000" /></label>
        <div v-else class="note-item-editor">
          <label>Content</label>
          <div v-for="(item, index) in items" :key="item.id" class="note-item-input-row">
            <Checkbox v-if="contentStyle === 'checklist'" v-model="item.checked" binary />
            <InputText v-model="item.text" :data-note-item-id="item.id" @blur="blurListItem(index)" @keydown.enter.prevent="enterListItem(index)" />
          </div>
          <Button label="Add item" icon="pi pi-plus" severity="secondary" outlined @click="addListItem()" />
        </div>
        <label>Tags
          <MultiSelect v-model="selectedTagIds" class="tag-multiselect" :options="tagOptions" option-label="name" option-value="id" display="chip">
            <template #chip="{ value, removeCallback }">
              <span class="task-tag tag-multiselect-chip" :style="tagStyle(value)">
                <span>{{ tagsById.get(value)?.name ?? value }}</span>
                <button class="tag-chip-remove" type="button" aria-label="Remove tag" @click.stop="removeCallback($event, value)">
                  <X :size="14" />
                </button>
              </span>
            </template>
            <template #option="{ option }">
              <span class="task-tag" :style="{ '--tag-color': option.color ?? '#6b7280' }">{{ option.name }}</span>
            </template>
          </MultiSelect>
        </label>
        <div class="note-style-row">
          <Button v-for="option in styleOptions" :key="option.value" :label="option.label" :class="{ active: contentStyle === option.value }" severity="secondary" outlined @click="updateStyle(option.value)" />
        </div>
        <div class="note-dialog-footer">
          <Button v-if="editingId" aria-label="Delete note" severity="danger" text @click="deleteDialogVisible = true"><Trash2 :size="18" /></Button>
          <span v-if="editingNote" class="muted">Last Modified {{ formatModified(editingNote.updatedAt) }}</span>
          <Button label="Save" :disabled="!canSave" @click="saveNote" />
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" modal header="Delete note" :style="{ width: 'min(420px, 92vw)' }">
      <p>This note will be deleted.</p>
      <div class="dialog-actions">
        <Button label="Confirm" severity="danger" @click="confirmDelete" />
      </div>
    </Dialog>
  </AppShell>
</template>
