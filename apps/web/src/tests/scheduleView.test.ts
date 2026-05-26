import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { Tag, Task } from "@its-personal/shared";
import ScheduleView from "../views/ScheduleView.vue";
import { usePlannerStore } from "../stores/planner.js";

const baseTask: Task = {
  id: "task-1",
  title: "Task",
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

const personalTag: Tag = {
  id: "tag-personal",
  name: "Personal",
  color: "#1d4ed8",
  archivedAt: null,
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  deletedAt: null
};

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {}
}));

function mountSchedule() {
  return mount(ScheduleView, {
    global: {
      stubs: {
        AppShell: { template: "<main><slot /></main>" },
        Button: { props: ["label", "disabled"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
        Card: { template: "<section><slot name='content' /></section>" },
        InputText: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
        MultiSelect: {
          props: ["modelValue", "options"],
          emits: ["update:modelValue"],
          template: "<select multiple :value='modelValue' @change='$emit(\"update:modelValue\", Array.from($event.target.selectedOptions).map((option) => option.value))'><option v-for='option in options' :key='option.id' :value='option.id'>{{ option.name }}</option></select>"
        },
        TaskList: defineComponent({
          props: ["tasks", "reorderable"],
          emits: ["reorder"],
          template: `
            <section class="task-list-stub" :data-reorderable="String(Boolean(reorderable))" @click="$emit('reorder', tasks)">
              <span v-for="task in tasks" :key="task.id">{{ task.title }}</span>
            </section>
          `
        })
      }
    }
  });
}

describe("ScheduleView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T08:00:00.000Z"));
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the selected day with planner-style reorder and completed sections", async () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "active", title: "Active task" },
      { ...baseTask, id: "done", title: "Done task", completedAt: "2026-05-21T02:00:00.000Z" }
    ];
    planner.refresh = vi.fn();
    planner.reorderTasks = vi.fn();

    const wrapper = mountSchedule();

    const activeList = wrapper.find(".task-list-stub");

    expect(activeList.attributes("data-reorderable")).toBe("true");
    expect(activeList.text()).toContain("Active task");
    expect(activeList.text()).not.toContain("Done task");

    await activeList.trigger("click");
    expect(planner.reorderTasks).toHaveBeenCalledWith([expect.objectContaining({ id: "active" })]);

    await wrapper.find(".completed-toggle").trigger("click");
    const lists = wrapper.findAll(".task-list-stub");

    expect(lists).toHaveLength(2);
    expect(lists[1]!.text()).toContain("Done task");
  });

  it("creates new tasks for the selected calendar date without exposing date editing", async () => {
    const planner = usePlannerStore();
    planner.tags = [personalTag];
    planner.refresh = vi.fn();
    planner.createTask = vi.fn(async (title: string, dueDate?: string, parentId: string | null = null, tagIds: string[] = []) => {
      const task = { ...baseTask, id: "created", title, dueDate: dueDate ?? "2026-05-21", parentId, tagIds };
      planner.tasks.push(task);
      return task;
    });

    const wrapper = mountSchedule();
    const day22 = wrapper.findAll("button").find((button) => button.text() === "22");
    await day22?.trigger("click");
    await wrapper.find("[aria-label='Toggle add task form']").trigger("click");
    await wrapper.find("input[placeholder='New task']").setValue("Scheduled task");
    await wrapper.find("select").setValue(["tag-personal"]);
    await wrapper.findAll("button").find((button) => button.text() === "Add")?.trigger("click");

    expect(wrapper.find("input[type='date']").exists()).toBe(false);
    expect(planner.createTask).toHaveBeenCalledWith("Scheduled task", "2026-05-22", null, ["tag-personal"]);
  });

  it("leaves current-month calendar days empty when no tasks are scheduled", () => {
    const planner = usePlannerStore();
    planner.refresh = vi.fn();

    const wrapper = mountSchedule();

    expect(wrapper.text()).not.toContain("0 tasks");
  });

  it("shows the magenta today marker only when today is not the selected calendar day", async () => {
    const planner = usePlannerStore();
    planner.refresh = vi.fn();

    const wrapper = mountSchedule();
    const today = () => wrapper.findAll("button").find((button) => button.text() === "21");
    const day22 = wrapper.findAll("button").find((button) => button.text() === "22");

    expect(today()?.classes()).toContain("active");
    expect(today()?.classes()).not.toContain("today");

    await day22?.trigger("click");

    expect(today()?.classes()).toContain("today");
    expect(today()?.classes()).not.toContain("active");
  });

  it("keeps out-of-month calendar days visible but unselectable without task counts", async () => {
    const planner = usePlannerStore();
    planner.tasks = [{ ...baseTask, id: "previous-month", title: "Previous month", dueDate: "2026-04-26" }];
    planner.refresh = vi.fn();

    const wrapper = mountSchedule();
    const previousMonthDay = wrapper.findAll("button").find((button) => button.text() === "26");

    expect(previousMonthDay?.exists()).toBe(true);
    expect(previousMonthDay?.attributes("disabled")).toBeDefined();
    expect(previousMonthDay?.text()).not.toContain("tasks");

    await previousMonthDay?.trigger("click");

    expect(wrapper.find("h3").text()).toBe("2026-05-21");
  });
});
