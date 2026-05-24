import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import SubtaskCreateDialog from "../components/SubtaskCreateDialog.vue";
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
  subtasksCollapsed: false,
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
    createSubtask: vi.fn(async () => ({
      id: "subtask-1",
      taskId: baseTask.id,
      title: "Use coupon",
      completedAt: null,
      order: 1000,
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      deletedAt: null
    })),
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
      recurrence: { type: "every_n_days", intervalDays: 1, ends: { type: "eternity" } }
    });
  });

  it("preserves interval and end date while switching recurrence types", async () => {
    const recurringTask: Task = {
      ...baseTask,
      recurrence: { type: "every_n_days", intervalDays: 10, ends: { type: "date", date: "2026-06-30" } }
    };
    vi.mocked(plannerApi.updateTask).mockImplementation(async (_id: string, patch: Partial<Task>) => ({ ...recurringTask, ...patch }));
    const planner = usePlannerStore();
    planner.tasks = [recurringTask];
    planner.selectedTaskId = recurringTask.id;

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

    const recurrenceSelect = wrapper.findComponent({ name: "Select" });
    await recurrenceSelect.vm.$emit("update:modelValue", "weekly");
    await flushPromises();
    await recurrenceSelect.vm.$emit("update:modelValue", "none");
    await flushPromises();
    await recurrenceSelect.vm.$emit("update:modelValue", "every_n_days");
    await flushPromises();

    expect(plannerApi.updateTask).toHaveBeenLastCalledWith(baseTask.id, {
      recurrence: { type: "every_n_days", intervalDays: 10, ends: { type: "date", date: "2026-06-30" } }
    });
  });

  it("waits until save before applying due date edits from the detail editor", async () => {
    const planner = usePlannerStore();
    planner.tasks = [baseTask];
    planner.selectedTaskId = baseTask.id;

    const wrapper = mount(TaskDetailPanel, {
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          FileUpload: { template: "<div />" },
          InputText: { name: "InputText", props: ["modelValue", "type"], emits: ["update:modelValue"], template: "<input :type='type' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
          MultiSelect: { props: ["modelValue"], template: "<div />" },
          Select: { name: "Select", inheritAttrs: false, props: ["modelValue"], emits: ["update:modelValue"], template: "<div />" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    const dueDateInput = wrapper.findAllComponents({ name: "InputText" }).find((input) => input.props("type") === "date");
    expect(dueDateInput).toBeTruthy();

    await dueDateInput!.vm.$emit("update:modelValue", "2026-05-22");
    await flushPromises();

    expect(plannerApi.updateTask).not.toHaveBeenCalled();
    expect(planner.selectedTask?.dueDate).toBe("2026-05-21");

    const saveButton = wrapper.findAll("button").find((button) => button.text() === "Save");
    expect(saveButton).toBeTruthy();

    await saveButton!.trigger("click");
    await flushPromises();

    expect(plannerApi.updateTask).toHaveBeenCalledWith(baseTask.id, { title: "Today", dueDate: "2026-05-22", notes: "" });
    expect(planner.selectedTask?.dueDate).toBe("2026-05-22");
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

  it("opens the subtask dialog and closes the task detail menu", async () => {
    const planner = usePlannerStore();
    planner.tasks = [baseTask];
    planner.selectedTaskId = baseTask.id;

    const wrapper = mount(TaskDetailPanel, {
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          FileUpload: { template: "<div />" },
          InputText: { props: ["modelValue", "placeholder"], emits: ["update:modelValue"], template: "<input :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
          MultiSelect: { props: ["modelValue"], template: "<div />" },
          Select: { name: "Select", inheritAttrs: false, props: ["modelValue"], emits: ["update:modelValue"], template: "<div />" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    const openButton = wrapper.findAll("button").find((button) => button.text() === "Add subtask");
    await openButton!.trigger("click");

    expect(planner.subtaskDialogTaskId).toBe(baseTask.id);
    expect(planner.selectedTaskId).toBeNull();
  });

  it("adds a subtask from the app-level dialog without reopening the task detail menu", async () => {
    const planner = usePlannerStore();
    planner.tasks = [baseTask];
    planner.selectedTaskId = null;
    planner.subtaskDialogTaskId = baseTask.id;

    const wrapper = mount(SubtaskCreateDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue", "placeholder"], emits: ["update:modelValue"], template: "<textarea :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" }
        }
      }
    });

    await wrapper.find("textarea[placeholder='New subtask']").setValue("Use coupon");

    const addButton = wrapper.findAll("button").find((button) => button.text() === "Add");
    await addButton!.trigger("click");
    await flushPromises();

    expect(plannerApi.createSubtask).toHaveBeenCalledWith({ taskId: baseTask.id, title: "Use coupon", order: 1000 });
    expect(planner.selectedTaskId).toBeNull();
    expect(planner.subtaskDialogTaskId).toBe(baseTask.id);
    expect(document.activeElement).toBe(wrapper.find("textarea[placeholder='New subtask']").element);

    wrapper.unmount();
  });
});
