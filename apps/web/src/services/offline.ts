import { Dexie, type Table } from "dexie";
import type { useSessionStore } from "../stores/session.js";

export type PendingState = "pending" | "failed";

export interface PendingOperation {
  operationId: string;
  entityType: "task" | "subtask" | "subtask-order" | "tag" | "link";
  entityId: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: Record<string, unknown>;
  base?: Record<string, unknown>;
  state: PendingState;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
}

class OfflineDb extends Dexie {
  operations!: Table<PendingOperation, string>;

  constructor() {
    super("its-personal-offline");
    this.version(1).stores({
      operations: "operationId, entityId, entityType, state, updatedAt"
    });
    this.version(2).stores({
      operations: "operationId, entityId, entityType, state, createdAt, updatedAt"
    });
  }
}

export const offlineDb = new OfflineDb();
const memoryOperations = new Map<string, PendingOperation>();

export function hasDurableOutbox() {
  if (typeof window !== "undefined" && (window as unknown as { __forceMemoryOutbox?: boolean }).__forceMemoryOutbox) return false;
  return typeof indexedDB !== "undefined";
}

const sessionStorageKey = "its-personal-offline-dialog-shown";

export function generateLocalId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const value = Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
  return `${prefix}_${value}`;
}

export function shouldShowOfflineDialog(): boolean {
  if (sessionStorage.getItem(sessionStorageKey) === "true") return false;
  sessionStorage.setItem(sessionStorageKey, "true");
  return true;
}

export async function pendingOperations(): Promise<PendingOperation[]> {
  if (!hasDurableOutbox()) return [...memoryOperations.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const operations = await offlineDb.operations.toArray();
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pendingEntityState(entityId: string): Promise<PendingState | null> {
  if (!hasDurableOutbox()) {
    const operations = [...memoryOperations.values()].filter((operation) => operation.entityId === entityId);
    if (operations.some((operation) => operation.state === "failed")) return "failed";
    return operations.length > 0 ? "pending" : null;
  }
  const operations = await offlineDb.operations.where("entityId").equals(entityId).toArray();
  if (operations.some((operation) => operation.state === "failed")) return "failed";
  return operations.length > 0 ? "pending" : null;
}

export async function savePendingOperation(operation: PendingOperation): Promise<void> {
  const storable = plainOperation(operation);
  if (!hasDurableOutbox()) {
    memoryOperations.set(storable.operationId, storable);
    return;
  }
  await offlineDb.operations.put(storable);
}

function plainOperation(operation: PendingOperation): PendingOperation {
  const storable: PendingOperation = {
    ...operation,
    body: JSON.parse(JSON.stringify(operation.body)) as Record<string, unknown>
  };
  if (operation.base) storable.base = JSON.parse(JSON.stringify(operation.base)) as Record<string, unknown>;
  return storable;
}

function sameBody(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const clean = (body: Record<string, unknown>) => Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "operationId")
  );
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

export async function saveCompactedPendingOperation(operation: PendingOperation): Promise<PendingOperation | null> {
  const operations = await pendingOperations();
  const existing = operations.filter((candidate) => candidate.entityId === operation.entityId);
  const pendingCreate = existing.find((candidate) => candidate.method === "POST" && !candidate.path.endsWith("/complete"));

  if (pendingCreate && operation.method === "PATCH") {
    const compacted = {
      ...pendingCreate,
      body: { ...pendingCreate.body, ...operation.body, operationId: pendingCreate.operationId },
      updatedAt: operation.updatedAt,
      state: "pending" as const,
      retryable: true
    };
    await savePendingOperation(compacted);
    return compacted;
  }

  if (pendingCreate && operation.method === "DELETE") {
    await removePendingOperation(pendingCreate.operationId);
    return null;
  }

  const sameMethod = existing.find((candidate) => candidate.method === operation.method && candidate.path === operation.path);
  if (sameMethod && sameBody(sameMethod.body, operation.body)) return sameMethod;
  if (sameMethod && operation.method === "PATCH") {
    const compacted = compactPatch(sameMethod, operation);
    await removePendingOperation(sameMethod.operationId);
    if (!compacted) return null;
    await savePendingOperation(compacted);
    return compacted;
  }

  if (operation.method === "PATCH") {
    const compacted = compactPatch(null, operation);
    if (!compacted) return null;
    await savePendingOperation(compacted);
    return compacted;
  }

  await savePendingOperation(operation);
  return operation;
}

function compactPatch(existing: PendingOperation | null, operation: PendingOperation): PendingOperation | null {
  const operationBody = bodyWithoutOperationId(operation.body);
  const base = { ...(operation.base ?? {}), ...(existing?.base ?? {}) };
  const merged = { ...(existing ? bodyWithoutOperationId(existing.body) : {}), ...operationBody };

  for (const key of Object.keys(merged)) {
    if (Object.prototype.hasOwnProperty.call(base, key) && JSON.stringify(merged[key]) === JSON.stringify(base[key])) {
      delete merged[key];
    }
  }

  if (Object.keys(merged).length === 0) return null;

  return {
    ...operation,
    body: { ...merged, operationId: operation.operationId },
    base,
    state: "pending",
    retryable: true
  };
}

function bodyWithoutOperationId(body: Record<string, unknown>): Record<string, unknown> {
  const { operationId: _operationId, ...rest } = body;
  return rest;
}

export async function removePendingOperation(operationId: string): Promise<void> {
  if (!hasDurableOutbox()) {
    memoryOperations.delete(operationId);
    return;
  }
  await offlineDb.operations.delete(operationId);
}

export async function removeFailedPendingOperations(): Promise<void> {
  if (!hasDurableOutbox()) {
    for (const [operationId, operation] of memoryOperations) {
      if (operation.state === "failed") memoryOperations.delete(operationId);
    }
    return;
  }
  await offlineDb.operations.where("state").equals("failed").delete();
}

export async function markPendingOperationFailed(operationId: string, retryable = true): Promise<void> {
  if (!hasDurableOutbox()) {
    const operation = memoryOperations.get(operationId);
    if (operation) memoryOperations.set(operationId, { ...operation, state: "failed", retryable, updatedAt: new Date().toISOString() });
    return;
  }
  await offlineDb.operations.update(operationId, { state: "failed", retryable, updatedAt: new Date().toISOString() });
}

export async function clearPendingOperations(): Promise<void> {
  memoryOperations.clear();
  if (hasDurableOutbox()) await offlineDb.operations.clear();
}

export async function sendPendingOperation(operation: PendingOperation, session: ReturnType<typeof useSessionStore>): Promise<Response> {
  return fetch(operation.path, {
    method: operation.method,
    headers: {
      "content-type": "application/json",
      ...session.authHeaders()
    },
    body: JSON.stringify(operation.body)
  });
}
