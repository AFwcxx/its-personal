import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import ArchiveView from "../views/ArchiveView.vue";
import { usePlannerStore } from "../stores/planner.js";

const baseTask: Task = {
  id: "task-1",
  title: "Task",
  parentId: null,
  dueDate: "2026-05-21",
  completedAt: "2026-05-21T01:00:00.000Z",
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

describe("ArchiveView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T08:00:00.000Z"));
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups completed archive tasks inside the default date range by due date", () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "out-of-range", title: "Old task", dueDate: "2026-04-20" },
      { ...baseTask, id: "range-start", title: "Range start task", dueDate: "2026-04-21" },
      { ...baseTask, id: "today", title: "Today task", dueDate: "2026-05-21" },
      { ...baseTask, id: "yesterday", title: "Yesterday task", dueDate: "2026-05-20" }
    ];
    planner.refresh = vi.fn();

    const wrapper = mount(ArchiveView, {
      global: {
        stubs: {
          AppShell: { template: "<main><slot /></main>" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          TaskList: { props: ["tasks", "hidePin"], template: "<ul :data-hide-pin='String(Boolean(hidePin))'><li v-for='task in tasks' :key='task.id'>{{ task.title }} {{ task.dueDate }}</li></ul>" }
        }
      }
    });

    const groups = wrapper.findAll(".date-group").map((group) => group.text());

    expect(groups).toHaveLength(3);
    expect(groups[0]).toContain("Date: 2026-05-21");
    expect(groups[0]).toContain("Today task 2026-05-21");
    expect(groups[1]).toContain("Date: 2026-05-20");
    expect(groups[1]).toContain("Yesterday task 2026-05-20");
    expect(groups[2]).toContain("Date: 2026-04-21");
    expect(groups[2]).toContain("Range start task 2026-04-21");
    expect(wrapper.text()).not.toContain("Old task");
    expect(wrapper.find("ul").attributes("data-hide-pin")).toBe("true");
  });
});
