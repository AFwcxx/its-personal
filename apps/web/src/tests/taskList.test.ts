import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import TaskList from "../components/TaskList.vue";
import TaskRow from "../components/TaskRow.vue";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

const sortable = vi.hoisted(() => ({
  create: vi.fn(),
  sort: vi.fn(),
  options: null as { onEnd: (event: { oldIndex?: number; newIndex?: number }) => void } | null
}));

vi.mock("sortablejs", () => ({
  default: { create: sortable.create }
}));

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {
    completeTask: vi.fn(),
    updateTask: vi.fn()
  }
}));

const task = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  title: patch.title ?? "Task",
  parentId: patch.parentId ?? null,
  dueDate: patch.dueDate ?? "2026-05-21",
  completedAt: patch.completedAt ?? null,
  pinned: patch.pinned ?? false,
  subtasksCollapsed: patch.subtasksCollapsed ?? false,
  tagId: patch.tagId ?? null,
  tagIds: patch.tagIds ?? [],
  notes: patch.notes ?? "",
  recurrence: patch.recurrence ?? { type: "none" },
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-21T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-21T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

describe("TaskList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sortable.options = null;
    sortable.create.mockReset();
    sortable.sort.mockReset();
    sortable.create.mockImplementation((_element, options) => {
      sortable.options = options;
      return { destroy: vi.fn(), sort: sortable.sort };
    });
  });

  it("keeps pinned tasks ahead of unpinned tasks after drag reorder", async () => {
    const pinned = task({ id: "pinned", pinned: true, order: 1000 });
    const unpinned = task({ id: "unpinned", order: 2000 });
    const wrapper = mount(TaskList, {
      props: { tasks: [pinned, unpinned], reorderable: true },
      global: {
        stubs: {
          TaskRow: { props: ["task"], template: "<div>{{ task.title }}</div>" }
        }
      }
    });

    await wrapper.vm.$nextTick();
    sortable.options?.onEnd({ oldIndex: 1, newIndex: 0 });

    const emittedTasks = wrapper.emitted("reorder")?.[0]?.[0] as Task[] | undefined;
    expect(emittedTasks?.map((item) => item.id)).toEqual(["pinned", "unpinned"]);
    expect(sortable.sort).toHaveBeenCalledWith(["pinned", "unpinned"]);
  });

  it("highlights only the row whose task detail menu is open", () => {
    const planner = usePlannerStore();
    planner.selectedTaskId = "open-task";

    const openTask = mount(TaskRow, {
      props: { task: task({ id: "open-task" }) },
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" }
        }
      }
    });
    const otherTask = mount(TaskRow, {
      props: { task: task({ id: "other-task" }) },
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" }
        }
      }
    });

    expect(openTask.find(".task-row").classes()).toContain("task-row-active");
    expect(otherTask.find(".task-row").classes()).not.toContain("task-row-active");
  });

  it("marks recurring tasks with the replay icon before the title", () => {
    const recurringTask = mount(TaskRow, {
      props: { task: task({ recurrence: { type: "weekly", ends: { type: "eternity" } } }) },
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" }
        }
      }
    });
    const oneTimeTask = mount(TaskRow, {
      props: { task: task({ recurrence: { type: "none" } }) },
      global: {
        stubs: {
          Button: { template: "<button><slot /></button>" }
        }
      }
    });

    expect(recurringTask.find(".task-title > .task-recurrence-icon + span").text()).toBe("Task");
    expect(recurringTask.find(".task-recurrence-icon").classes()).toEqual(expect.arrayContaining(["pi", "pi-replay"]));
    expect(oneTimeTask.find(".task-recurrence-icon").exists()).toBe(false);
  });

  it("shows a chevron only for tasks with visible subtasks and hides the subtask list when collapsed", async () => {
    const planner = usePlannerStore();
    planner.subtasks = [
      {
        id: "visible-subtask",
        taskId: "parent",
        title: "Visible",
        completedAt: null,
        order: 1000,
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
        deletedAt: null
      },
      {
        id: "deleted-subtask",
        taskId: "without-visible-subtasks",
        title: "Deleted",
        completedAt: null,
        order: 1000,
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
        deletedAt: "2026-05-21T01:00:00.000Z"
      }
    ];
    const wrapper = mount(TaskList, {
      props: {
        tasks: [
          task({ id: "parent", title: "Parent", subtasksCollapsed: true }),
          task({ id: "without-visible-subtasks", title: "No visible subtasks" })
        ]
      },
      global: {
        stubs: {
          SubtaskList: {
            props: ["taskId", "subtasks"],
            template: "<div v-if='subtasks.some((subtask) => subtask.taskId === taskId && subtask.deletedAt === null)' class='subtask-list-stub'>{{ taskId }}</div>"
          }
        }
      }
    });

    expect(wrapper.find("button[aria-label='Expand subtasks']").exists()).toBe(true);
    expect(wrapper.find("button[aria-label='Collapse subtasks']").exists()).toBe(false);
    expect(wrapper.find(".subtask-list-stub").exists()).toBe(false);
    expect(wrapper.findAll(".row-actions button").filter((button) => button.attributes("aria-label")?.includes("subtasks"))).toHaveLength(1);

    vi.mocked(plannerApi.updateTask).mockResolvedValue(task({ id: "parent", subtasksCollapsed: false }));
    await wrapper.find("button[aria-label='Expand subtasks']").trigger("click");

    expect(planner.selectedTaskId).toBeNull();
    expect(plannerApi.updateTask).toHaveBeenCalledWith("parent", { subtasksCollapsed: false });
  });

  it("keeps the chevron before the completion checkbox when the pin is hidden", () => {
    const planner = usePlannerStore();
    planner.subtasks = [{
      id: "subtask",
      taskId: "archived",
      title: "Archived subtask",
      completedAt: null,
      order: 1000,
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      deletedAt: null
    }];
    const wrapper = mount(TaskList, {
      props: { tasks: [task({ id: "archived" })], hidePin: true },
      global: {
        stubs: {
          SubtaskList: true
        }
      }
    });

    const labels = wrapper.findAll(".row-actions button").map((button) => button.attributes("aria-label"));
    expect(labels).toEqual(["Collapse subtasks", "Complete"]);
  });
});
