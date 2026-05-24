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
        Button: { props: ["label", "icon"], template: "<button @click='$emit(\"click\")'><i v-if='icon' :class='icon'></i>{{ label }}<slot /></button>" },
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

  it("shows a sun action beside active overdue date groups so a full missed day can move to today", async () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "older", title: "Older overdue", dueDate: "2026-05-11" },
      { ...baseTask, id: "recent", title: "Recent overdue", dueDate: "2026-05-18" },
      { ...baseTask, id: "today", title: "Today", dueDate: "2026-05-21" }
    ];
    planner.refresh = vi.fn();

    const wrapper = mountPlanner();
    const overdueButton = wrapper.findAll("button").find((button) => button.text() === "Overdue");
    await overdueButton?.trigger("click");

    const groups = wrapper.findAll(".date-group");
    const firstGroup = groups[0];
    const secondGroup = groups[1];
    if (!firstGroup || !secondGroup) throw new Error("Expected two overdue date groups");

    expect(groups).toHaveLength(2);
    expect(firstGroup.find("button[aria-label='Move overdue group to today']").classes()).toContain("date-move-today-button");
    expect(firstGroup.find(".pi-sun").exists()).toBe(true);
    expect(secondGroup.find("button[aria-label='Move overdue group to today']").exists()).toBe(true);
  });

  it("hides overdue group sun actions while search filters the task set", async () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "older", title: "Older overdue", dueDate: "2026-05-11" },
      { ...baseTask, id: "recent", title: "Recent overdue", dueDate: "2026-05-18" }
    ];
    planner.refresh = vi.fn();

    const wrapper = mountPlanner();
    const overdueButton = wrapper.findAll("button").find((button) => button.text() === "Overdue");
    await overdueButton?.trigger("click");
    await wrapper.find("input").setValue("Older");

    expect(wrapper.find("button[aria-label='Move overdue group to today']").exists()).toBe(false);
  });

  it("confirms the overdue group move and updates matching tasks plus child task records to today's planner date", async () => {
    const planner = usePlannerStore();
    planner.currentDate = "2026-05-21";
    planner.tasks = [
      { ...baseTask, id: "parent", title: "Parent overdue", dueDate: "2026-05-18" },
      { ...baseTask, id: "child", title: "Child overdue", parentId: "parent", dueDate: "2026-05-17" },
      { ...baseTask, id: "other", title: "Other overdue", dueDate: "2026-05-11" }
    ];
    planner.refresh = vi.fn();
    planner.updateTask = vi.fn(async (id: string, patch: Partial<Task>) => {
      const existing = planner.tasks.find((task) => task.id === id);
      if (!existing) throw new Error("Task not found");
      const updated = { ...existing, ...patch };
      planner.tasks = planner.tasks.map((task) => task.id === id ? updated : task);
      return updated;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const wrapper = mountPlanner();
    const overdueButton = wrapper.findAll("button").find((button) => button.text() === "Overdue");
    await overdueButton?.trigger("click");
    const firstGroup = wrapper.findAll(".date-group")[0];
    if (!firstGroup) throw new Error("Expected an overdue date group");
    await firstGroup.find("button[aria-label='Move overdue group to today']").trigger("click");

    expect(confirm).toHaveBeenCalledWith("Move 2 tasks to today (2026-05-21)?");
    expect(planner.updateTask).toHaveBeenCalledWith("parent", { dueDate: "2026-05-21" });
    expect(planner.updateTask).toHaveBeenCalledWith("child", { dueDate: "2026-05-21" });
    expect(planner.updateTask).not.toHaveBeenCalledWith("other", expect.anything());
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
