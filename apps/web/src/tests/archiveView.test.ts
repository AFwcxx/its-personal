import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("groups completed archive tasks by due date so each task stays under its own date", () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "future", title: "Future task", dueDate: "2026-05-23" },
      { ...baseTask, id: "today", title: "Today task", dueDate: "2026-05-21" },
      { ...baseTask, id: "tomorrow", title: "Tomorrow task", dueDate: "2026-05-22" }
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
    expect(groups[0]).toContain("Date: 2026-05-23");
    expect(groups[0]).toContain("Future task 2026-05-23");
    expect(groups[1]).toContain("Date: 2026-05-22");
    expect(groups[1]).toContain("Tomorrow task 2026-05-22");
    expect(groups[2]).toContain("Date: 2026-05-21");
    expect(groups[2]).toContain("Today task 2026-05-21");
    expect(wrapper.find("ul").attributes("data-hide-pin")).toBe("true");
  });
});
