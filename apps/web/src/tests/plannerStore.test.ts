import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Subtask, Task } from "@its-personal/shared";
import { cachedSnapshot, loadSnapshot, plannerApi } from "../services/api.js";
import { clearPendingOperations, pendingOperations, savePendingOperation } from "../services/offline.js";
import { usePlannerStore } from "../stores/planner.js";
import { useSessionStore } from "../stores/session.js";

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {
    completeTask: vi.fn(),
    createSubtask: vi.fn(),
    updateTask: vi.fn(),
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

  it("auto-expands a collapsed task when adding a new subtask", async () => {
    const planner = usePlannerStore();
    const created = subtask({ id: "created", title: "Created" });
    const expanded = task({ subtasksCollapsed: false });
    vi.mocked(plannerApi.createSubtask).mockResolvedValue(created);
    vi.mocked(plannerApi.updateTask).mockResolvedValue(expanded);
    planner.tasks = [task({ subtasksCollapsed: true })];

    await planner.createSubtask("task", "Created");

    expect(plannerApi.updateTask).toHaveBeenCalledWith("task", { subtasksCollapsed: false });
    expect(planner.tasks[0]?.subtasksCollapsed).toBe(false);
  });

  it("keeps offline collapse toggles local without queueing an API update", async () => {
    const planner = usePlannerStore();
    planner.status = "offline";
    planner.tasks = [task({ subtasksCollapsed: false })];

    await planner.setSubtasksCollapsed("task", true);

    expect(planner.tasks[0]?.subtasksCollapsed).toBe(true);
    expect(plannerApi.updateTask).not.toHaveBeenCalled();
  });

  it("refuses to complete a task while an active subtask is still open", async () => {
    const planner = usePlannerStore();
    planner.tasks = [task({ id: "parent" })];
    planner.subtasks = [subtask({ id: "open-subtask", taskId: "parent" })];

    const completed = await planner.completeTask("parent");

    expect(completed).toBe(false);
    expect(planner.tasks[0]?.completedAt).toBeNull();
    expect(plannerApi.completeTask).not.toHaveBeenCalled();
  });
});

describe("planner store pending projection replay", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await clearPendingOperations();
  });

  it("replays pending creates over a cached snapshot after an offline refresh", async () => {
    vi.mocked(loadSnapshot).mockRejectedValue(new TypeError("offline"));
    vi.mocked(cachedSnapshot).mockReturnValue({ tasks: [task({ id: "task-1", title: "Cached" })], subtasks: [], tags: [], links: [], attachments: [], today: "2026-05-25" });
    await savePendingOperation({
      operationId: "op-create",
      entityType: "task",
      entityId: "task-local",
      method: "POST",
      path: "/api/planner/tasks",
      body: { id: "task-local", operationId: "op-create", title: "Offline task", dueDate: "2026-05-25", parentId: null, tagIds: [] },
      state: "pending",
      retryable: true,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });

    const planner = usePlannerStore();
    await planner.refresh();

    expect(planner.status).toBe("offline");
    expect(planner.tasks.map((candidate) => candidate.title)).toEqual(["Cached", "Offline task"]);
    expect(planner.pendingEntityStates["task-local"]).toBeDefined();
  });

  it("keeps pending deletes hidden after replaying over a cached snapshot", async () => {
    vi.mocked(loadSnapshot).mockRejectedValue(new TypeError("offline"));
    vi.mocked(cachedSnapshot).mockReturnValue({ tasks: [task({ id: "task-1", title: "Cached" })], subtasks: [], tags: [], links: [], attachments: [], today: "2026-05-25" });
    await savePendingOperation({
      operationId: "op-delete",
      entityType: "task",
      entityId: "task-1",
      method: "DELETE",
      path: "/api/planner/tasks/task-1",
      body: { operationId: "op-delete" },
      state: "pending",
      retryable: true,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });

    const planner = usePlannerStore();
    await planner.refresh();

    expect(planner.allVisible().map((candidate) => candidate.id)).toEqual([]);
    expect(planner.pendingEntityStates["task-1"]).toBeDefined();
  });

  it("shows reconstructable pending creates even when no cached snapshot exists", async () => {
    vi.mocked(loadSnapshot).mockRejectedValue(new TypeError("offline"));
    vi.mocked(cachedSnapshot).mockReturnValue(null);
    await savePendingOperation({
      operationId: "op-create",
      entityType: "task",
      entityId: "task-local",
      method: "POST",
      path: "/api/planner/tasks",
      body: { id: "task-local", operationId: "op-create", title: "Offline task", dueDate: "2026-05-25", parentId: null, tagIds: [] },
      state: "pending",
      retryable: true,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });

    const planner = usePlannerStore();
    await planner.refresh();

    expect(planner.status).toBe("offline");
    expect(planner.tasks.map((candidate) => candidate.title)).toEqual(["Offline task"]);
  });
});

describe("planner store session-expired pending writes", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.restoreAllMocks();
    await clearPendingOperations();
    Object.defineProperty(window.navigator, "userAgent", { value: "Chrome", configurable: true });
    (window as unknown as { __forceMemoryOutbox: boolean }).__forceMemoryOutbox = true;
    const session = useSessionStore();
    session.token = "expired-token";
    session.lastActivityAt = Date.now();
  });

  it("keeps a user write retryable when the server returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "expired" }), { status: 401 })));
    const planner = usePlannerStore();

    await planner.createTask("After expiry", "2026-05-25");

    const operations = await pendingOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ state: "pending", retryable: true });
    expect(useSessionStore().isUnlocked).toBe(false);
  });

  it("does not make an existing pending operation non-retryable when sync hits 401", async () => {
    await savePendingOperation({
      operationId: "op-create",
      entityType: "task",
      entityId: "task-local",
      method: "POST",
      path: "/api/planner/tasks",
      body: { id: "task-local", operationId: "op-create", title: "After expiry", dueDate: "2026-05-25", parentId: null, tagIds: [] },
      state: "pending",
      retryable: true,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "expired" }), { status: 401 })));

    await usePlannerStore().syncPending();

    const operations = await pendingOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ state: "pending", retryable: true });
    expect(useSessionStore().isUnlocked).toBe(false);
  });
});

describe("planner store offline write responsiveness", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    await clearPendingOperations();
    Object.defineProperty(window.navigator, "userAgent", { value: "Chrome", configurable: true });
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    (window as unknown as { __forceMemoryOutbox: boolean }).__forceMemoryOutbox = true;
    const session = useSessionStore();
    session.token = "token";
    session.lastActivityAt = Date.now();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not block task creation when the immediate offline write never settles", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const planner = usePlannerStore();

    const create = planner.createTask("Offline task", "2026-05-25");
    await vi.advanceTimersByTimeAsync(1500);
    const task = await create;

    expect(task.title).toBe("Offline task");
    expect(planner.tasks.map((candidate) => candidate.title)).toEqual(["Offline task"]);
    expect(planner.savedOfflineDialogVisible).toBe(true);
    const operations = await pendingOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ state: "pending", retryable: true });
  });
});
