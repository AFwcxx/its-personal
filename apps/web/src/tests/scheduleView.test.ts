import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { Task } from "@its-personal/shared";
import ScheduleView from "../views/ScheduleView.vue";
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

    const wrapper = mount(ScheduleView, {
      global: {
        stubs: {
          AppShell: { template: "<main><slot /></main>" },
          Button: { props: ["label"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
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
});
