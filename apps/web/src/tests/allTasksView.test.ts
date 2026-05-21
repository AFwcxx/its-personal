import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { Task } from "@its-personal/shared";
import AllTasksView from "../views/AllTasksView.vue";
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

describe("AllTasksView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T08:00:00.000Z"));
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reorders only the tasks from the affected date group", async () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "future", title: "Future task", dueDate: "2026-05-22" },
      { ...baseTask, id: "today-1", title: "Today first", dueDate: "2026-05-21", order: 1000 },
      { ...baseTask, id: "today-2", title: "Today second", dueDate: "2026-05-21", order: 2000 }
    ];
    planner.refresh = vi.fn();
    planner.reorderTasks = vi.fn();

    const wrapper = mount(AllTasksView, {
      global: {
        stubs: {
          AppShell: { template: "<main><slot /></main>" },
          Checkbox: { template: "<input type='checkbox' />" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          TaskList: defineComponent({
            props: ["tasks", "reorderable"],
            emits: ["reorder"],
            template: "<button type='button' @click='$emit(\"reorder\", tasks)'>reorder</button>"
          })
        }
      }
    });

    const reorderButtons = wrapper.findAll("button");
    expect(reorderButtons).toHaveLength(2);
    await reorderButtons[1]!.trigger("click");

    expect(planner.reorderTasks).toHaveBeenCalledWith([
      expect.objectContaining({ id: "today-1" }),
      expect.objectContaining({ id: "today-2" })
    ]);
  });
});
