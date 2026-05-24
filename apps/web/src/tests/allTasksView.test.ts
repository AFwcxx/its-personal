import { flushPromises, mount } from "@vue/test-utils";
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
    await reorderButtons[0]!.trigger("click");

    expect(planner.reorderTasks).toHaveBeenCalledWith([
      expect.objectContaining({ id: "today-1" }),
      expect.objectContaining({ id: "today-2" })
    ]);
  });

  it("orders date groups from earliest to latest", () => {
    const planner = usePlannerStore();
    planner.tasks = [
      { ...baseTask, id: "latest", dueDate: "2026-05-26" },
      { ...baseTask, id: "middle", dueDate: "2026-05-24" },
      { ...baseTask, id: "earliest", dueDate: "2026-05-23" }
    ];
    planner.refresh = vi.fn();

    const wrapper = mount(AllTasksView, {
      global: {
        stubs: {
          AppShell: { template: "<main><slot /></main>" },
          Checkbox: { template: "<input type='checkbox' />" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          TaskList: { props: ["tasks"], template: "<div />" }
        }
      }
    });

    expect(wrapper.findAll(".date-heading").map((heading) => heading.text())).toEqual([
      "Date: 2026-05-23",
      "Date: 2026-05-24",
      "Date: 2026-05-26"
    ]);
  });

  it("resets the default date range from the refreshed current date when opened", async () => {
    const planner = usePlannerStore();
    planner.refresh = vi.fn(async () => {
      planner.currentDate = "2026-05-22";
    });

    const wrapper = mount(AllTasksView, {
      global: {
        stubs: {
          AppShell: { template: "<main><slot /></main>" },
          Checkbox: { template: "<input type='checkbox' />" },
          InputText: { props: ["modelValue"], template: "<input :value='modelValue' />" },
          TaskList: { props: ["tasks"], template: "<div />" }
        }
      }
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect((inputs[1]!.element as HTMLInputElement).value).toBe("2026-05-22");
    expect((inputs[2]!.element as HTMLInputElement).value).toBe("2026-06-22");
  });
});
