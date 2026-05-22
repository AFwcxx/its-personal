import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag, Task } from "@its-personal/shared";
import PlannerView from "../views/PlannerView.vue";
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

function mountPlanner() {
  return mount(PlannerView, {
    global: {
      stubs: {
        AppShell: { template: "<main><slot /></main>" },
        Button: { props: ["label"], template: "<button @click='$emit(\"click\")'>{{ label }}<slot /></button>" },
        Card: { template: "<section><slot name='content' /></section>" },
        InputText: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
        Message: { template: "<div><slot /></div>" },
        MultiSelect: {
          props: ["modelValue", "options"],
          emits: ["update:modelValue"],
          template: "<select multiple :value='modelValue' @change='$emit(\"update:modelValue\", Array.from($event.target.selectedOptions).map((option) => option.value))'><option v-for='option in options' :key='option.id' :value='option.id'>{{ option.name }}</option></select>"
        },
        TaskList: { props: ["tasks"], template: "<ul><li v-for='task in tasks' :key='task.id'>{{ task.title }} {{ task.dueDate }}</li></ul>" }
      }
    }
  });
}

describe("PlannerView", () => {
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

  it("groups overdue tasks by due date so missed work stays scannable by day", async () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "older", title: "Older overdue", dueDate: "2026-05-11" },
      { ...baseTask, id: "recent", title: "Recent overdue", dueDate: "2026-05-18" },
      { ...baseTask, id: "oldest", title: "Oldest overdue", dueDate: "2026-05-06" },
      { ...baseTask, id: "today", title: "Today", dueDate: "2026-05-21" }
    ];
    planner.refresh = vi.fn();

    const wrapper = mountPlanner();
    const overdueButton = wrapper.findAll("button").find((button) => button.text() === "Overdue");
    await overdueButton?.trigger("click");

    const groups = wrapper.findAll(".date-group").map((group) => group.text());

    expect(groups).toHaveLength(3);
    expect(groups[0]).toContain("Date: 2026-05-18");
    expect(groups[0]).toContain("Recent overdue 2026-05-18");
    expect(groups[1]).toContain("Date: 2026-05-11");
    expect(groups[1]).toContain("Older overdue 2026-05-11");
    expect(groups[2]).toContain("Date: 2026-05-06");
    expect(groups[2]).toContain("Oldest overdue 2026-05-06");
  });

  it("creates new tasks with selected tags so tasks can be categorized before opening details", async () => {
    const planner = usePlannerStore();
    planner.tags = [personalTag];
    planner.refresh = vi.fn();
    planner.createTask = vi.fn(async (title: string, dueDate?: string, parentId: string | null = null, tagIds: string[] = []) => {
      const task = { ...baseTask, id: "created", title, dueDate: dueDate ?? "2026-05-21", parentId, tagIds };
      planner.tasks.push(task);
      return task;
    });

    const wrapper = mountPlanner();
    await wrapper.find("[aria-label='Toggle add task form']").trigger("click");
    await wrapper.find("input[placeholder='New task']").setValue("Tagged task");
    await wrapper.find("select").setValue(["tag-personal"]);
    await wrapper.findAll("button").find((button) => button.text() === "Add")?.trigger("click");

    expect(planner.createTask).toHaveBeenCalledWith("Tagged task", "2026-05-21", null, ["tag-personal"]);
    expect((wrapper.find("select").element as HTMLSelectElement).selectedOptions).toHaveLength(0);
  });

  it("starts the add task form collapsed and preserves draft values across toggles", async () => {
    const planner = usePlannerStore();
    planner.tags = [personalTag];
    planner.refresh = vi.fn();

    const wrapper = mountPlanner();
    const toggle = wrapper.find("[aria-label='Toggle add task form']");

    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".task-create-card-collapsed").exists()).toBe(true);

    await toggle.trigger("click");
    await wrapper.find("input[placeholder='New task']").setValue("Draft task");
    await wrapper.find("select").setValue(["tag-personal"]);
    await toggle.trigger("click");
    await toggle.trigger("click");

    expect((wrapper.find("input[placeholder='New task']").element as HTMLInputElement).value).toBe("Draft task");
    expect([...((wrapper.find("select").element as HTMLSelectElement).selectedOptions)].map((option) => option.value)).toEqual(["tag-personal"]);
  });
});
