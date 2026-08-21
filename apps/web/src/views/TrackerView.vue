<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AppShell from "../components/AppShell.vue";
import { usePlannerStore } from "../stores/planner.js";

const planner = usePlannerStore();
const month = ref(planner.today.slice(0, 7));
const tableScroll = ref<HTMLElement | null>(null);
const expanded = ref(false);
const newName = ref("");
const submitting = ref(false);
const selectedTrackerId = ref<string | null>(null);
const editingName = ref("");
const retireDialogVisible = ref(false);

const selectedTracker = computed(() => planner.trackers.find((tracker) => tracker.id === selectedTrackerId.value) ?? null);
const visibleTrackers = computed(() => planner.trackers.filter((tracker) => tracker.activeFromMonth <= month.value && (tracker.retiredFromMonth === null || month.value < tracker.retiredFromMonth)));
const days = computed(() => {
  const [year, monthNumber] = month.value.split("-").map(Number);
  const count = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => `${month.value}-${String(index + 1).padStart(2, "0")}`);
});
const marked = computed(() => new Set(planner.trackerMarks.map((mark) => `${mark.trackerId}:${mark.date}`)));
const retirementBlocked = computed(() => selectedTracker.value !== null && planner.trackerMarks.some((mark) => mark.trackerId === selectedTracker.value!.id && mark.date.slice(0, 7) >= month.value));

onMounted(async () => {
  await planner.refresh();
  month.value = planner.today.slice(0, 7);
  await revealToday();
});
watch(month, revealToday);

function move(delta: number) {
  const [year, monthNumber] = month.value.split("-").map(Number);
  month.value = new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel() {
  return new Date(`${month.value}-01T00:00:00.000Z`).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).charAt(0);
}

function isMarked(trackerId: string, date: string) {
  return marked.value.has(`${trackerId}:${date}`);
}

async function toggleMark(trackerId: string, date: string) {
  await planner.setTrackerMark(trackerId, date, !isMarked(trackerId, date));
}

async function createTracker() {
  const name = newName.value.trim();
  if (!name || submitting.value) return;
  submitting.value = true;
  try {
    await planner.createTracker(name, month.value);
    newName.value = "";
  } finally {
    submitting.value = false;
  }
}

function openTracker(id: string) {
  const tracker = planner.trackers.find((candidate) => candidate.id === id);
  if (!tracker) return;
  selectedTrackerId.value = id;
  editingName.value = tracker.name;
}

async function renameTracker() {
  const name = editingName.value.trim();
  if (!selectedTracker.value || !name) return;
  await planner.updateTracker(selectedTracker.value.id, { name });
  selectedTrackerId.value = null;
}

async function retireTracker() {
  if (!selectedTracker.value || retirementBlocked.value) return;
  await planner.updateTracker(selectedTracker.value.id, { retiredFromMonth: month.value });
  retireDialogVisible.value = false;
  selectedTrackerId.value = null;
}

async function revealToday() {
  await nextTick();
  if (!tableScroll.value) return;
  if (month.value !== planner.today.slice(0, 7)) {
    tableScroll.value.scrollLeft = 0;
    return;
  }
  const today = tableScroll.value.querySelector<HTMLElement>(`[data-date="${planner.today}"]`);
  const label = tableScroll.value.querySelector<HTMLElement>(".tracker-label-cell");
  if (today) tableScroll.value.scrollLeft = Math.max(0, today.offsetLeft - (label?.offsetWidth ?? 0));
}
</script>

<template>
  <AppShell>
    <div class="toolbar">
      <h2>Tracker</h2>
      <div class="schedule-month-controls">
        <Button label="Prev" severity="secondary" @click="move(-1)" />
        <span>{{ monthLabel() }}</span>
        <Button label="Next" severity="secondary" @click="move(1)" />
      </div>
    </div>

    <div ref="tableScroll" class="tracker-table-scroll">
      <table class="tracker-table">
        <thead>
          <tr>
            <th class="tracker-label-cell" scope="col">Tracker</th>
            <th v-for="date in days" :key="date" :class="{ 'tracker-today': date === planner.today }" :data-date="date" scope="col">
              <span>{{ Number(date.slice(8)) }}</span>
              <span>{{ weekday(date) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="visibleTrackers.length === 0">
            <th class="tracker-label-cell" scope="row">No trackers for this month</th>
            <td :colspan="days.length" />
          </tr>
          <tr v-for="tracker in visibleTrackers" :key="tracker.id">
            <th class="tracker-label-cell" scope="row">
              <button type="button" @click="openTracker(tracker.id)">{{ tracker.name }}</button>
            </th>
            <td v-for="date in days" :key="date" :class="{ 'tracker-today': date === planner.today }">
              <button
                type="button"
                :aria-label="`${tracker.name}, ${date}`"
                :aria-pressed="isMarked(tracker.id, date)"
                @click="toggleMark(tracker.id, date)"
              >
                <span v-if="isMarked(tracker.id, date)" aria-hidden="true">x</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Card class="task-create-card" :class="{ 'task-create-card-collapsed': !expanded }">
      <template #content>
        <button class="task-create-toggle" type="button" :aria-expanded="expanded" aria-label="Toggle add tracker form" @click="expanded = !expanded">
          <ChevronUp v-if="expanded" :size="16" aria-hidden="true" />
          <ChevronDown v-else :size="18" aria-hidden="true" />
        </button>
        <div class="task-create-body" :aria-hidden="!expanded" :inert="!expanded">
          <div class="task-create-body-inner">
            <div class="task-create-form tracker-create-form">
              <InputText v-model="newName" maxlength="80" placeholder="New tracker" @keydown.enter.prevent="createTracker" />
              <Button :disabled="submitting" label="Add" @click="createTracker" />
            </div>
          </div>
        </div>
      </template>
    </Card>

    <Dialog :visible="selectedTracker !== null" modal header="Manage tracker" :style="{ width: 'min(420px, 92vw)' }" @update:visible="selectedTrackerId = $event ? selectedTrackerId : null">
      <div class="field-stack">
        <label>Tracker name<InputText v-model="editingName" maxlength="80" @keydown.enter.prevent="renameTracker" /></label>
        <p v-if="retirementBlocked" class="muted">Clear marks from {{ monthLabel() }} onward before stopping this tracker.</p>
      </div>
      <div class="dialog-actions">
        <Button label="Save" @click="renameTracker" />
        <Button v-if="selectedTracker?.retiredFromMonth === null" label="Stop tracking" severity="danger" outlined :disabled="retirementBlocked" @click="retireDialogVisible = true" />
        <Button label="Cancel" severity="secondary" text @click="selectedTrackerId = null" />
      </div>
    </Dialog>

    <Dialog v-model:visible="retireDialogVisible" modal header="Stop tracking?" :style="{ width: 'min(420px, 92vw)' }">
      <p>This hides {{ selectedTracker?.name }} from {{ monthLabel() }} onward. Earlier marks remain available.</p>
      <div class="dialog-actions">
        <Button label="Cancel" severity="secondary" text @click="retireDialogVisible = false" />
        <Button label="Stop tracking" severity="danger" @click="retireTracker" />
      </div>
    </Dialog>
  </AppShell>
</template>
