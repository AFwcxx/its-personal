import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subtask } from "@its-personal/shared";
import { plannerApi } from "../services/api.js";
import { usePlannerStore } from "../stores/planner.js";

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {
    createSubtask: vi.fn(),
    updateSubtask: vi.fn()
  }
}));

const subtask = (patch: Partial<Subtask>): Subtask => ({
  id: patch.id ?? "subtask",
  taskId: patch.taskId ?? "task",
  title: patch.title ?? "Subtask",
  completedAt: patch.completedAt ?? null,
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-21T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-21T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

describe("planner store subtask ordering", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("creates the next subtask after the current optimistic sibling order", async () => {
    const planner = usePlannerStore();
    const first = subtask({ id: "first", order: 1000 });
    const second = subtask({ id: "second", order: 2000 });
    const created = subtask({ id: "third", title: "Third", order: 3000 });
    vi.mocked(plannerApi.updateSubtask).mockResolvedValue(first);
    vi.mocked(plannerApi.createSubtask).mockResolvedValue(created);
    planner.subtasks = [first, second];

    planner.reorderSubtasks([second, first]);
    await planner.createSubtask("task", "Third");

    expect(plannerApi.updateSubtask).toHaveBeenNthCalledWith(1, "second", { order: 1000 });
    expect(plannerApi.createSubtask).toHaveBeenCalledWith({ taskId: "task", title: "Third", order: 3000 });
  });
});
