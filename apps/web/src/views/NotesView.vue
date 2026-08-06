<script lang="ts">
const noteScrollPositions = new Map<string, number>();
</script>

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

const noteTagFilterStorageKey = "its-personal-notes-tag-filter";
const noteScrollViewport = "(max-width: 1024px) and (orientation: portrait)";
const noteScrollFadeDistance = 32;
const notes = useNotesStore();
const search = ref("");
const selectedFilterTagIds = ref(readPersistedTagFilter());
const dialogVisible = ref(false);
const deleteDialogVisible = ref(false);
const editingId = ref<string | null>(null);
const title = ref("");
const content = ref("");
const contentStyle = ref<NoteContentStyle>("normal");
const items = ref<NoteListItem[]>([]);
const calculateValues = ref<Record<string, string>>({});
const invalidValueIds = ref<Set<string>>(new Set());
const focusedItemId = ref<string | null>(null);
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
  { label: "Bullets", value: "unordered" },
  { label: "Calculate", value: "calculate" }
];

const calculateTotalCents = computed(() => {
  let total = 0n;
  for (const item of items.value) {
    const parsed = parseCents(calculateValues.value[item.id] ?? "");
    if (parsed === null) return null;
    total += BigInt(parsed ?? 0);
  }
  return total;
});

const tagOptions = computed(() => notes.activeTags);
const tagsById = computed(() => new Map(notes.tags.map((tag) => [tag.id, tag])));
const activeFilterTagIds = computed(() => {
  const activeIds = new Set(tagOptions.value.map((tag) => tag.id));
  return selectedFilterTagIds.value.filter((tagId) => activeIds.has(tagId));
});
const filteredNotes = computed(() => {
  const q = search.value.trim().toLowerCase();
  const visible = notes.visibleNotes;
  const tagIds = activeFilterTagIds.value;
  const matched = visible.filter((note) => {
    const matchesSearch = q
      ? `${note.title}\n${note.content}\n${note.items.map((item) => item.text).join("\n")}`.toLowerCase().includes(q)
      : true;
    const matchesTags = tagIds.length === 0 || tagIds.some((tagId) => note.tagIds.includes(tagId));
    return matchesSearch && matchesTags;
  });
  return [...matched].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || b.createdAt.localeCompare(a.createdAt));
});
const pinnedNotes = computed(() => filteredNotes.value.filter((note) => note.pinned));
const unpinnedNotes = computed(() => filteredNotes.value.filter((note) => !note.pinned));
const editingNote = computed(() => notes.notes.find((note) => note.id === editingId.value) ?? null);
const canSave = computed(() => title.value.trim().length > 0 || content.value.trim().length > 0 || items.value.some((item) => item.text.trim().length > 0));
const canReorderNotes = computed(() => search.value.trim().length === 0 && activeFilterTagIds.value.length === 0);

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
  rememberNoteScrollPositions(pinnedListEl.value);
  rememberNoteScrollPositions(unpinnedListEl.value);
  pinnedSortable?.destroy();
  unpinnedSortable?.destroy();
  window.removeEventListener("resize", scheduleMasonryLayout);
  if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
  if (refreshTimer) clearInterval(refreshTimer);
});

watch(
  () => [notesLayoutKey(pinnedNotes.value), notesLayoutKey(unpinnedNotes.value), canReorderNotes.value],
  async () => {
    await nextTick();
    mountSortable();
    scheduleMasonryLayout();
  },
  { immediate: true, flush: "post" }
);

watch(selectedFilterTagIds, (tagIds) => {
  localStorage.setItem(noteTagFilterStorageKey, JSON.stringify(tagIds));
}, { deep: true });

function readPersistedTagFilter() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(noteTagFilterStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((tagId): tagId is string => typeof tagId === "string") : [];
  } catch {
    return [];
  }
}

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

  updateNoteScrollRegions(grid);

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

function updateNoteScrollRegions(grid: HTMLElement) {
  for (const region of grid.querySelectorAll<HTMLElement>(".note-scroll-region")) {
    const entries = Array.from(region.children) as HTMLElement[];
    const first = entries[0];
    const lastVisible = entries[Math.min(entries.length, 5) - 1];
    if (first && lastVisible) {
      region.style.setProperty("--note-scroll-limit", `${lastVisible.offsetTop + lastVisible.offsetHeight - first.offsetTop}px`);
    } else {
      region.style.removeProperty("--note-scroll-limit");
    }

    updateNoteScrollFade(region);
    if (window.matchMedia(noteScrollViewport).matches && region.dataset.scrollRestored !== "true") {
      region.scrollTop = noteScrollPositions.get(region.dataset.noteId ?? "") ?? 0;
      region.dataset.scrollRestored = "true";
      updateNoteScrollFade(region);
    }
  }
}

function handleNoteScroll(event: Event) {
  const region = event.currentTarget as HTMLElement;
  const noteId = region.dataset.noteId;
  if (noteId) noteScrollPositions.set(noteId, region.scrollTop);
  updateNoteScrollFade(region);
}

function rememberNoteScrollPositions(grid: HTMLElement | null) {
  for (const region of grid?.querySelectorAll<HTMLElement>(".note-scroll-region") ?? []) {
    const noteId = region.dataset.noteId;
    if (noteId) noteScrollPositions.set(noteId, region.scrollTop);
  }
}

function updateNoteScrollFade(region: HTMLElement) {
  const remaining = Math.max(0, region.scrollHeight - region.clientHeight - region.scrollTop);
  const overflowing = region.scrollHeight > region.clientHeight + 1;
  region.classList.toggle("is-scrollable", overflowing);
  if (overflowing) {
    region.tabIndex = 0;
    region.setAttribute("aria-label", "Scrollable note content");
  } else {
    region.removeAttribute("tabindex");
    region.removeAttribute("aria-label");
  }
  region.style.setProperty("--note-scroll-top-edge-opacity", String(1 - Math.min(region.scrollTop / noteScrollFadeDistance, 1)));
  region.style.setProperty("--note-scroll-bottom-edge-opacity", String(1 - Math.min(remaining / noteScrollFadeDistance, 1)));
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
    note.items.map((item) => `${item.id}:${item.text}:${Boolean(item.checked)}:${item.valueCents ?? ""}`).join("|"),
    note.tagIds.join(","),
    note.order
  ].join("~")).join("::");
}

function createSortable(el: HTMLElement | null, source: Note[]) {
  if (!el || source.length < 2 || !canReorderNotes.value) return null;
  let lastHandledOrder = noteIdsKey(source);
  const persistDroppedOrder = () => {
    const reordered = orderedNotesFromDom(el, source);
    const orderKey = noteIdsKey(reordered);
    if (orderKey === lastHandledOrder) return;
    lastHandledOrder = orderKey;
    void notes.reorderNotes(reordered);
  };
  return Sortable.create(el, {
    animation: 150,
    handle: ".note-drag-handle",
    draggable: ".note-card",
    onEnd: persistDroppedOrder
  });
}

function noteIdsKey(items: Note[]) {
  return items.map((note) => note.id).join(",");
}

function orderedNotesFromDom(el: HTMLElement, source: Note[]) {
  const byId = new Map(source.map((note) => [note.id, note]));
  const ordered = Array.from(el.querySelectorAll<HTMLElement>(".note-card"))
    .map((card) => card.dataset.id ? byId.get(card.dataset.id) : undefined)
    .filter((note): note is Note => note !== undefined);
  return ordered.length === source.length ? ordered : source;
}

function openCreateDialog() {
  editingId.value = null;
  title.value = "";
  content.value = "";
  contentStyle.value = "normal";
  items.value = [];
  calculateValues.value = {};
  invalidValueIds.value = new Set();
  focusedItemId.value = null;
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
  calculateValues.value = Object.fromEntries(note.items.map((item) => [item.id, centsToInput(item.valueCents)]));
  invalidValueIds.value = new Set();
  focusedItemId.value = null;
  pinned.value = note.pinned;
  selectedTagIds.value = [...note.tagIds];
  dialogVisible.value = true;
}

function togglePinned() {
  pinned.value = !pinned.value;
}

function updateStyle(value: NoteContentStyle) {
  if (value === contentStyle.value) return;
  if (contentStyle.value === "calculate" && !syncCalculateValues()) return;
  if (value === "normal") {
    content.value = contentStyle.value === "normal" ? content.value : items.value.map((item) => item.text).join("\n");
    items.value = [];
  } else {
    items.value = contentStyle.value === "normal" ? textToItems(content.value) : items.value.map((item) => ({ id: item.id, text: item.text, checked: value === "checklist" ? false : undefined, valueCents: item.valueCents }));
    content.value = "";
    if (items.value.length === 0) addListItem();
    if (value === "calculate") calculateValues.value = Object.fromEntries(items.value.map((item) => [item.id, centsToInput(item.valueCents)]));
  }
  contentStyle.value = value;
}

function addListItem(index = items.value.length) {
  const item = { id: generateLocalId("note_item"), text: "", checked: false };
  items.value.splice(index, 0, item);
  calculateValues.value[item.id] = "";
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-note-item-id="${items.value[index]?.id}"]`);
    input?.focus();
  });
}

function blurListItem(index: number) {
  focusedItemId.value = null;
  if (items.value.length <= 1) return;
  const item = items.value[index];
  if (item?.text.trim() === "") {
    items.value.splice(index, 1);
    delete calculateValues.value[item.id];
  }
}

function enterListItem(index: number) {
  addListItem(index + 1);
}

function canDeleteListItem(item: NoteListItem) {
  return items.value.length > 1 && focusedItemId.value === item.id && item.text.trim().length > 0;
}

function deleteListItem(index: number) {
  const item = items.value[index];
  if (!item || items.value.length <= 1) return;
  focusedItemId.value = null;
  items.value.splice(index, 1);
  delete calculateValues.value[item.id];
}

async function saveNote() {
  if (!canSave.value) return;
  if (contentStyle.value === "calculate" && !syncCalculateValues()) return;
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
    checked: contentStyle.value === "checklist" ? Boolean(item.checked) : undefined,
    valueCents: item.valueCents
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

function parseCents(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -cents : cents;
  return signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(signed) : null;
}

function syncCalculateValues() {
  const invalid = new Set<string>();
  for (const item of items.value) {
    const parsed = parseCents(calculateValues.value[item.id] ?? "");
    if (parsed === null) invalid.add(item.id);
    else item.valueCents = parsed;
  }
  invalidValueIds.value = invalid;
  return invalid.size === 0;
}

function blurCalculateValue(itemId: string) {
  const parsed = parseCents(calculateValues.value[itemId] ?? "");
  const next = new Set(invalidValueIds.value);
  if (parsed === null) next.add(itemId);
  else next.delete(itemId);
  invalidValueIds.value = next;
}

function centsToInput(cents: number | undefined) {
  if (cents === undefined) return "";
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

const decimalSeparator = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
const minusSign = new Intl.NumberFormat().formatToParts(-1).find((part) => part.type === "minusSign")?.value ?? "-";
const wholeNumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const fractionNumberFormat = new Intl.NumberFormat(undefined, { useGrouping: false, minimumIntegerDigits: 2 });

function formatCents(cents: number | bigint | undefined) {
  const value = BigInt(cents ?? 0);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? minusSign : ""}${wholeNumberFormat.format(absolute / 100n)}${decimalSeparator}${fractionNumberFormat.format(absolute % 100n)}`;
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

function removeTagChip(event: MouseEvent, removeCallback: (event: Event, item?: unknown) => void) {
  removeCallback(event);
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
      <div class="notes-filters">
        <InputText v-model="search" class="notes-search" placeholder="Search notes" />
        <MultiSelect
          v-model="selectedFilterTagIds"
          class="tag-multiselect notes-tag-filter"
          :options="tagOptions"
          option-label="name"
          option-value="id"
          display="chip"
          placeholder="Tags"
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
      </div>
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
            <ul v-else-if="note.contentStyle === 'checklist'" class="note-list note-checklist note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
              <li v-for="item in note.items" :key="item.id">
                <Checkbox :model-value="Boolean(item.checked)" binary @click.stop @update:model-value="notes.toggleChecklistItem(note.id, item.id)" />
                <span :class="{ checked: item.checked }">{{ item.text }}</span>
              </li>
            </ul>
            <ol v-else-if="note.contentStyle === 'ordered'" class="note-list note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ol>
            <div v-else-if="note.contentStyle === 'calculate'" class="note-calculate">
              <div class="note-calculate-items note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
                <div v-for="item in note.items" :key="item.id" class="note-calculate-item"><span>{{ item.text }}</span><span>{{ formatCents(item.valueCents) }}</span></div>
              </div>
              <div class="note-calculate-total"><span>Total</span><strong>{{ formatCents(note.items.reduce((total, item) => total + BigInt(item.valueCents ?? 0), 0n)) }}</strong></div>
            </div>
            <ul v-else class="note-list note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
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
            <ul v-else-if="note.contentStyle === 'checklist'" class="note-list note-checklist note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
              <li v-for="item in note.items" :key="item.id">
                <Checkbox :model-value="Boolean(item.checked)" binary @click.stop @update:model-value="notes.toggleChecklistItem(note.id, item.id)" />
                <span :class="{ checked: item.checked }">{{ item.text }}</span>
              </li>
            </ul>
            <ol v-else-if="note.contentStyle === 'ordered'" class="note-list note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
              <li v-for="item in note.items" :key="item.id">{{ item.text }}</li>
            </ol>
            <div v-else-if="note.contentStyle === 'calculate'" class="note-calculate">
              <div class="note-calculate-items note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
                <div v-for="item in note.items" :key="item.id" class="note-calculate-item"><span>{{ item.text }}</span><span>{{ formatCents(item.valueCents) }}</span></div>
              </div>
              <div class="note-calculate-total"><span>Total</span><strong>{{ formatCents(note.items.reduce((total, item) => total + BigInt(item.valueCents ?? 0), 0n)) }}</strong></div>
            </div>
            <ul v-else class="note-list note-scroll-region" :data-note-id="note.id" @scroll="handleNoteScroll">
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
          <TransitionGroup name="note-item-row" tag="div" class="note-item-input-rows">
            <div v-for="(item, index) in items" :key="item.id" class="note-item-input-row">
              <Checkbox v-if="contentStyle === 'checklist'" v-model="item.checked" binary />
              <InputText
                v-model="item.text"
                :data-note-item-id="item.id"
                @focus="focusedItemId = item.id"
                @blur="blurListItem(index)"
                @keydown.enter.prevent="enterListItem(index)"
              />
              <label v-if="contentStyle === 'calculate'" class="note-calculate-value">
                <input
                  v-model="calculateValues[item.id]"
                  :aria-label="`Value for ${item.text || `item ${index + 1}`}`"
                  class="p-inputtext p-component"
                  inputmode="decimal"
                  placeholder="0.00"
                  @blur="blurCalculateValue(item.id)"
                />
                <small v-if="invalidValueIds.has(item.id)" class="note-calculate-error">Enter a valid value with up to 2 decimal places</small>
              </label>
              <span class="note-item-delete-slot" :class="{ visible: canDeleteListItem(item) }">
                <button
                  class="note-item-delete-button"
                  type="button"
                  aria-label="Delete content entry"
                  :tabindex="canDeleteListItem(item) ? 0 : -1"
                  @mousedown.prevent
                  @click="deleteListItem(index)"
                >
                  <Trash2 :size="16" />
                </button>
              </span>
            </div>
          </TransitionGroup>
          <div v-if="contentStyle === 'calculate'" class="note-calculate-total">
            <span>Total</span><strong>{{ calculateTotalCents === null ? '—' : formatCents(calculateTotalCents) }}</strong>
          </div>
          <Button label="Add item" icon="pi pi-plus" severity="secondary" outlined @click="addListItem()" />
        </div>
        <label>Tags
          <MultiSelect v-model="selectedTagIds" class="tag-multiselect" :options="tagOptions" option-label="name" option-value="id" display="chip">
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
