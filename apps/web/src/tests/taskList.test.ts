import { mount } from "@vue/test-utils";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import TaskList from "../components/TaskList.vue";

const sortable = vi.hoisted(() => ({
  create: vi.fn(),
  sort: vi.fn(),
  options: null as { onEnd: (event: { oldIndex?: number; newIndex?: number }) => void } | null
}));

vi.mock("sortablejs", () => ({
  default: { create: sortable.create }
}));

const task = (patch: Partial<Task>): Task => ({
  id: patch.id ?? "task",
  title: patch.title ?? "Task",
  parentId: patch.parentId ?? null,
  dueDate: patch.dueDate ?? "2026-05-21",
  completedAt: patch.completedAt ?? null,
  pinned: patch.pinned ?? false,
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
});
