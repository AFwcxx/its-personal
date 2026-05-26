import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Subtask, Task } from "@its-personal/shared";
import { cachedSnapshot, loadPlannerChangeVersion, loadSnapshot, plannerApi } from "../services/api.js";
import { clearPendingOperations, pendingOperations, savePendingOperation } from "../services/offline.js";
import { usePlannerStore } from "../stores/planner.js";
import { useSessionStore } from "../stores/session.js";

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] })),
  loadPlannerChangeVersion: vi.fn(async () => 0),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {
    completeTask: vi.fn(),
    createSubtask: vi.fn(),
    updateTask: vi.fn(),
    updateSubtask: vi.fn(),
    reorderSubtasks: vi.fn()
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the next subtask after the current optimistic sibling order", async () => {
    vi.useFakeTimers();
    const planner = usePlannerStore();
    const first = subtask({ id: "first", order: 1000 });
    const second = subtask({ id: "second", order: 2000 });
    const created = subtask({ id: "third", title: "Third", order: 3000 });
    vi.mocked(plannerApi.reorderSubtasks).mockResolvedValue([second, first]);
    vi.mocked(plannerApi.createSubtask).mockResolvedValue(created);
    planner.subtasks = [first, second];

    planner.reorderSubtasks([second, first]);
    await planner.createSubtask("task", "Third");
    await vi.advanceTimersByTimeAsync(250);

    expect(plannerApi.createSubtask).toHaveBeenCalledWith({ taskId: "task", title: "Third", order: 3000 });
  });

  it("coalesces rapid subtask reorders into the latest list-level sync", async () => {
    vi.useFakeTimers();
    const planner = usePlannerStore();
    const first = subtask({ id: "first", order: 1000 });
    const second = subtask({ id: "second", order: 2000 });
    const third = subtask({ id: "third", order: 3000 });
    vi.mocked(plannerApi.reorderSubtasks).mockResolvedValue([third, second, first]);
    planner.subtasks = [first, second, third];

    planner.reorderSubtasks([second, first, third]);
    planner.reorderSubtasks([third, second, first]);
    await vi.advanceTimersByTimeAsync(250);

    expect(plannerApi.reorderSubtasks).toHaveBeenCalledTimes(1);
    expect(plannerApi.reorderSubtasks).toHaveBeenCalledWith("task", { orderedIds: ["third", "second", "first"] });
  });

  it("sends the latest subtask order again after an older in-flight reorder finishes", async () => {
    vi.useFakeTimers();
    const planner = usePlannerStore();
    const first = subtask({ id: "first", order: 1000 });
    const second = subtask({ id: "second", order: 2000 });
    const third = subtask({ id: "third", order: 3000 });
    const responses: Array<(subtasks: Subtask[]) => void> = [];
    vi.mocked(plannerApi.reorderSubtasks).mockImplementation(() => new Promise((resolve) => responses.push(resolve)));
    planner.subtasks = [first, second, third];

    planner.reorderSubtasks([second, first, third]);
    await vi.advanceTimersByTimeAsync(250);
    planner.reorderSubtasks([third, second, first]);

    expect(plannerApi.reorderSubtasks).toHaveBeenCalledTimes(1);
    expect(plannerApi.reorderSubtasks).toHaveBeenNthCalledWith(1, "task", { orderedIds: ["second", "first", "third"] });

    responses[0]!([second, first, third]);
    await vi.advanceTimersByTimeAsync(0);

    expect(plannerApi.reorderSubtasks).toHaveBeenCalledTimes(2);
    expect(plannerApi.reorderSubtasks).toHaveBeenNthCalledWith(2, "task", { orderedIds: ["third", "second", "first"] });
  });

  it("keeps reordered subtasks when a completion response returns stale order", async () => {
    const planner = usePlannerStore();
    const first = subtask({ id: "first", order: 1000 });
    const second = subtask({ id: "second", order: 2000 });
    vi.mocked(plannerApi.updateSubtask).mockImplementation(async (id, patch) => subtask({
      id,
      ...patch,
      order: id === "second" ? 2000 : 1000
    }));
    planner.subtasks = [first, second];
    planner.subtasks = planner.subtasks.map((candidate) => candidate.id === "second" ? { ...candidate, order: 1000 } : { ...candidate, order: 2000 });

    await planner.toggleSubtask("second");

    expect(planner.subtasks.find((candidate) => candidate.id === "second")?.order).toBe(1000);
    expect(planner.subtasks.find((candidate) => candidate.id === "second")?.completedAt).not.toBeNull();
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

describe("planner store live refresh", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("refreshes snapshots only when the server change version moves", async () => {
    const planner = usePlannerStore();
    planner.changeVersion = 1;
    vi.mocked(loadPlannerChangeVersion).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    vi.mocked(loadSnapshot).mockResolvedValueOnce({ tasks: [task({ id: "remote", title: "Remote task" })], subtasks: [], tags: [], links: [], attachments: [], changeVersion: 2 } as Awaited<ReturnType<typeof loadSnapshot>>);

    await planner.refreshIfChanged();
    expect(loadSnapshot).not.toHaveBeenCalled();

    await planner.refreshIfChanged();
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(planner.tasks.map((candidate) => candidate.title)).toEqual(["Remote task"]);
    expect(planner.changeVersion).toBe(2);
  });
});

describe("planner store task update ordering", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("does not let an older note save response overwrite a newer local note edit", async () => {
    const planner = usePlannerStore();
    planner.tasks = [task({ notes: "" })];
    const responses: Array<(value: Task) => void> = [];
    vi.mocked(plannerApi.updateTask).mockImplementation(() => new Promise<Task>((resolve) => responses.push(resolve)));

    const firstSave = planner.updateTask("task", { notes: "Keep deleted words" });
    const secondSave = planner.updateTask("task", { notes: "Keep words" });

    responses[1]!(task({ notes: "Keep words" }));
    await secondSave;
    responses[0]!(task({ notes: "Keep deleted words" }));
    await firstSave;

    expect(planner.tasks[0]?.notes).toBe("Keep words");
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

describe("planner store failed sync recovery", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.restoreAllMocks();
    await clearPendingOperations();
    vi.mocked(loadSnapshot).mockResolvedValue({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] });
  });

  it("tracks retryable failed writes separately from rejected writes", async () => {
    await savePendingOperation({
      operationId: "op-retryable",
      entityType: "task",
      entityId: "task-retryable",
      method: "PATCH",
      path: "/api/planner/tasks/task-retryable",
      body: { operationId: "op-retryable", title: "Retryable" },
      state: "failed",
      retryable: true,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });
    await savePendingOperation({
      operationId: "op-rejected",
      entityType: "task",
      entityId: "task-rejected",
      method: "PATCH",
      path: "/api/planner/tasks/task-rejected",
      body: { operationId: "op-rejected", title: "Rejected" },
      state: "failed",
      retryable: false,
      createdAt: "2026-05-25T00:00:01.000Z",
      updatedAt: "2026-05-25T00:00:01.000Z"
    });

    const planner = usePlannerStore();
    await planner.refreshPendingStatus();

    expect(planner.failedSyncCount).toBe(2);
    expect(planner.retryableFailedSyncCount).toBe(1);
  });

  it("discards failed local writes when the user confirms recovery", async () => {
    await savePendingOperation({
      operationId: "op-rejected",
      entityType: "task",
      entityId: "task-rejected",
      method: "PATCH",
      path: "/api/planner/tasks/task-rejected",
      body: { operationId: "op-rejected", title: "Rejected" },
      state: "failed",
      retryable: false,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });

    const planner = usePlannerStore();
    await planner.discardFailedSyncOperations();

    expect(await pendingOperations()).toEqual([]);
    expect(planner.failedSyncCount).toBe(0);
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

  it("does not flash pending state for a successful online subtask toggle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(subtask({ id: "subtask", completedAt: "2026-05-25T00:00:00.000Z" })), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    const planner = usePlannerStore();
    planner.subtasks = [subtask({ id: "subtask", completedAt: null })];

    await planner.toggleSubtask("subtask");

    expect(planner.pendingCount).toBe(0);
    expect(planner.pendingEntityStates).toEqual({});
    expect(await pendingOperations()).toEqual([]);
  });

  it("shows pending state immediately for a known-offline subtask toggle", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const planner = usePlannerStore();
    planner.subtasks = [subtask({ id: "subtask", completedAt: null })];

    await planner.toggleSubtask("subtask");

    expect(planner.pendingCount).toBe(1);
    expect(planner.pendingEntityStates.subtask).toBe("pending");
    expect(await pendingOperations()).toHaveLength(1);
  });

  it("keeps tag and note edits folded into an offline-created task", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    const planner = usePlannerStore();

    const task = await planner.createTask("Offline task", "2026-05-25");
    await planner.updateTask(task.id, { tagIds: ["tag-1"], notes: "Keep this note" });

    const operations = await pendingOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.method).toBe("POST");
    expect(operations[0]?.body).toMatchObject({
      operationId: operations[0]?.operationId,
      tagIds: ["tag-1"],
      notes: "Keep this note"
    });
  });
});
