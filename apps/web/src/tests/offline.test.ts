import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingOperations, markPendingOperationFailed, pendingOperations, saveCompactedPendingOperation, type PendingOperation } from "../services/offline.js";

function operation(patch: Partial<PendingOperation>): PendingOperation {
  const pending: PendingOperation = {
    operationId: patch.operationId ?? "op-1",
    entityType: patch.entityType ?? "task",
    entityId: patch.entityId ?? "task-1",
    method: patch.method ?? "PATCH",
    path: patch.path ?? "/api/planner/tasks/task-1",
    body: patch.body ?? { operationId: patch.operationId ?? "op-1", title: "First" },
    state: patch.state ?? "pending",
    retryable: patch.retryable ?? true,
    createdAt: patch.createdAt ?? "2026-05-25T00:00:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-05-25T00:00:00.000Z"
  };
  if (patch.base) pending.base = patch.base;
  return pending;
}

describe("offline outbox compaction", () => {
  beforeEach(async () => {
    await clearPendingOperations();
  });

  it("ignores duplicate repeated updates that introduce no new value", async () => {
    await saveCompactedPendingOperation(operation({ operationId: "op-1", body: { operationId: "op-1", title: "Same" } }));
    await saveCompactedPendingOperation(operation({ operationId: "op-2", body: { operationId: "op-2", title: "Same" } }));

    const operations = await pendingOperations();

    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationId).toBe("op-1");
  });

  it("compacts repeated updates to the latest changed value", async () => {
    await saveCompactedPendingOperation(operation({ operationId: "op-1", body: { operationId: "op-1", title: "First" } }));
    await saveCompactedPendingOperation(operation({ operationId: "op-2", body: { operationId: "op-2", title: "Second" } }));

    const operations = await pendingOperations();

    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationId).toBe("op-2");
    expect(operations[0]?.body.title).toBe("Second");
  });

  it("merges repeated updates so different field edits are not lost", async () => {
    await saveCompactedPendingOperation(operation({ operationId: "op-1", body: { operationId: "op-1", title: "First" }, base: { title: "Original" } }));
    await saveCompactedPendingOperation(operation({ operationId: "op-2", body: { operationId: "op-2", notes: "Keep this" }, base: { notes: "" } }));

    const operations = await pendingOperations();

    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationId).toBe("op-2");
    expect(operations[0]?.body).toMatchObject({ operationId: "op-2", title: "First", notes: "Keep this" });
  });

  it("drops fields that return to their original synced value", async () => {
    await saveCompactedPendingOperation(operation({ operationId: "op-1", body: { operationId: "op-1", title: "Draft", notes: "Keep" }, base: { title: "Original", notes: "" } }));
    await saveCompactedPendingOperation(operation({ operationId: "op-2", body: { operationId: "op-2", title: "Original" }, base: { title: "Draft" } }));

    const operations = await pendingOperations();

    expect(operations).toHaveLength(1);
    expect(operations[0]?.body).toEqual({ notes: "Keep", operationId: "op-2" });
    expect(operations[0]?.base).toMatchObject({ title: "Original", notes: "" });
  });

  it("folds updates to a pending create into the create operation", async () => {
    await saveCompactedPendingOperation(operation({
      operationId: "op-create",
      method: "POST",
      path: "/api/planner/tasks",
      body: { id: "task-1", operationId: "op-create", title: "Draft", dueDate: "2026-05-25" }
    }));
    await saveCompactedPendingOperation(operation({ operationId: "op-update", body: { operationId: "op-update", title: "Final" } }));

    const operations = await pendingOperations();

    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationId).toBe("op-create");
    expect(operations[0]?.body.title).toBe("Final");
    expect(operations[0]?.body.operationId).toBe("op-create");
  });

  it("drops a pending create when the same entity is deleted before sync", async () => {
    await saveCompactedPendingOperation(operation({
      operationId: "op-create",
      method: "POST",
      path: "/api/planner/tasks",
      body: { id: "task-1", operationId: "op-create", title: "Draft", dueDate: "2026-05-25" }
    }));
    await saveCompactedPendingOperation(operation({ operationId: "op-delete", method: "DELETE", body: { operationId: "op-delete" } }));

    expect(await pendingOperations()).toEqual([]);
  });

  it("marks validation failures as non-retryable pending failures", async () => {
    await saveCompactedPendingOperation(operation({ operationId: "op-1" }));

    await markPendingOperationFailed("op-1", false);

    expect((await pendingOperations())[0]).toMatchObject({ state: "failed", retryable: false });
  });
});
