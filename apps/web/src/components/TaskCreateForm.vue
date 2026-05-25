<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import MultiSelect from "primevue/multiselect";
import { ChevronDown, ChevronUp, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { usePlannerStore } from "../stores/planner.js";

const props = withDefaults(defineProps<{
  dueDate: string;
  showDueDate?: boolean;
}>(), {
  showDueDate: true
});
const emit = defineEmits<{
  "update:dueDate": [value: string];
}>();

const planner = usePlannerStore();
const newTitle = ref("");
const newTagIds = ref<string[]>([]);
const expanded = ref(false);
const submitting = ref(false);

const tagOptions = computed(() => planner.activeTags);
const tagsById = computed(() => new Map(planner.activeTags.map((tag) => [tag.id, tag])));

async function createTask() {
  if (submitting.value || !newTitle.value.trim() || !props.dueDate) return;
  submitting.value = true;
  try {
    await planner.createTask(newTitle.value.trim(), props.dueDate, null, newTagIds.value);
    newTitle.value = "";
    newTagIds.value = [];
  } finally {
    submitting.value = false;
  }
}

function tagStyle(tagId: string) {
  return { "--tag-color": tagsById.value.get(tagId)?.color ?? "#6b7280" };
}

function removeTagChip(event: MouseEvent, removeCallback: (event: Event, item?: unknown) => void) {
  removeCallback(event);
}

function updateDueDate(value: string | undefined) {
  emit("update:dueDate", value ?? "");
}

function toggleExpanded() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <Card class="task-create-card" :class="{ 'task-create-card-collapsed': !expanded }">
    <template #content>
      <button class="task-create-toggle" type="button" :aria-expanded="expanded" aria-label="Toggle add task form" @click="toggleExpanded">
        <ChevronUp v-if="expanded" :size="16" aria-hidden="true" />
        <ChevronDown v-else :size="18" aria-hidden="true" />
      </button>
      <div class="task-create-body" :aria-hidden="!expanded" :inert="!expanded">
        <div class="task-create-body-inner">
          <div class="task-create-form">
            <InputText v-model="newTitle" placeholder="New task" @keydown.enter.prevent="createTask" />
            <div class="task-create-actions" :class="{ 'task-create-actions-no-date': !showDueDate }">
              <InputText v-if="showDueDate" class="task-create-date" :model-value="dueDate" type="date" aria-label="Due date" @update:model-value="updateDueDate" @keydown.enter.prevent="createTask" />
              <Button :disabled="submitting" label="Add" @click="createTask" />
              <MultiSelect
                class="tag-multiselect task-create-tags"
                v-model="newTagIds"
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
        </div>
      </div>
    </template>
  </Card>
</template>
