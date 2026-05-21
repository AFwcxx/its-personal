import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import PlannerView from "../views/PlannerView.vue";
import { usePlannerStore } from "../stores/planner.js";

const baseTask: Task = {
  id: "task-1",
  title: "Task",
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
        InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
        Message: { template: "<div><slot /></div>" },
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
});
