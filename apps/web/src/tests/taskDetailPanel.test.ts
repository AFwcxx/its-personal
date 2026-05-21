import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import TaskDetailPanel from "../components/TaskDetailPanel.vue";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const baseTask: Task = {
  id: "task-1",
  title: "Today",
  parentId: null,
  dueDate: "2026-05-21",
  completedAt: null,
  pinned: false,
  tagId: null,
  tagIds: [],
  notes: "",
  recurrence: { type: "none" },
  order: 1000,
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  deletedAt: null
};

vi.mock("../services/api.js", () => ({
  openAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
  plannerApi: {
    createLink: vi.fn(),
    deleteTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async (_id: string, patch: Partial<Task>) => ({ ...baseTask, ...patch }))
  }
}));

describe("TaskDetailPanel recurrence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("saves a custom every-N-days recurrence from the detail editor", async () => {
    const planner = usePlannerStore();
    planner.tasks = [baseTask];
    planner.selectedTaskId = baseTask.id;

    const wrapper = mount(TaskDetailPanel, {
      global: {
        stubs: {
          Button: { props: ["label"], template: "<button><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          FileUpload: { template: "<div />" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          MultiSelect: { props: ["modelValue"], template: "<div />" },
          Select: { name: "Select", inheritAttrs: false, props: ["modelValue"], emits: ["update:modelValue"], template: "<div />" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    await wrapper.findComponent({ name: "Select" }).vm.$emit("update:modelValue", "every_n_days");

    expect(plannerApi.updateTask).toHaveBeenCalledWith(baseTask.id, {
      recurrence: { type: "every_n_days", intervalDays: 1 }
    });
  });

  it("asks for confirmation before deleting the selected task", async () => {
    const planner = usePlannerStore();
    planner.tasks = [baseTask];
    planner.selectedTaskId = baseTask.id;

    const wrapper = mount(TaskDetailPanel, {
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          FileUpload: { template: "<div />" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          MultiSelect: { props: ["modelValue"], template: "<div />" },
          Select: { name: "Select", inheritAttrs: false, props: ["modelValue"], emits: ["update:modelValue"], template: "<div />" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    const deleteButton = wrapper.findAll("button").find((button) => button.text() === "Delete task");
    expect(deleteButton).toBeTruthy();

    await deleteButton!.trigger("click");

    expect(plannerApi.deleteTask).not.toHaveBeenCalled();

    const confirmButton = wrapper.findAll("button").find((button) => button.text() === "Confirm");
    expect(confirmButton).toBeTruthy();

    await confirmButton!.trigger("click");
    await flushPromises();

    expect(plannerApi.deleteTask).toHaveBeenCalledWith(baseTask.id);
    expect(planner.selectedTaskId).toBeNull();
  });
});
