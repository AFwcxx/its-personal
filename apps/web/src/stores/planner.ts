import { addDays, normalizeRecurrence, overdueTasks, plannerTasksForDate, scheduledTasksForDate, sortPlannerItems, todayISO, visibleArchiveItems, type Attachment, type PlannerSnapshot, type Subtask, type Tag, type Task, type TaskLink } from "@its-personal/shared";
import { defineStore } from "pinia";
import { cachedSnapshot, loadSnapshot, plannerApi } from "../services/api.js";
import { generateLocalId, hasDurableOutbox, markPendingOperationFailed, pendingOperations, removePendingOperation, saveCompactedPendingOperation, sendPendingOperation, shouldShowOfflineDialog, type PendingOperation, type PendingState } from "../services/offline.js";
import { useSessionStore } from "./session.js";

export const usePlannerStore = defineStore("planner", {
  state: () => ({
    tasks: [] as Task[],
    subtasks: [] as Subtask[],
    tags: [] as Tag[],
    links: [] as TaskLink[],
    attachments: [] as Attachment[],
    selectedTaskId: null as string | null,
    subtaskDialogTaskId: null as string | null,
    currentDate: todayISO(),
    status: "idle" as "idle" | "loading" | "offline" | "error",
    error: "",
    pendingEntityStates: {} as Record<string, PendingState>,
    pendingCount: 0,
    failedSyncCount: 0,
    savedOfflineDialogVisible: false
  }),
  getters: {
    selectedTask: (state) => state.tasks.find((task) => task.id === state.selectedTaskId) ?? null,
    activeTags: (state) => state.tags.filter((tag) => !tag.deletedAt && !tag.archivedAt),
    archiveTasks: (state) => visibleArchiveItems(state.tasks),
    today: (state) => state.currentDate
  },
  actions: {
    apply(snapshot: PlannerSnapshot) {
      this.tasks = snapshot.tasks.map((task) => ({
        ...task,
        tagIds: task.tagIds ?? (task.tagId ? [task.tagId] : []),
        subtasksCollapsed: task.subtasksCollapsed ?? false,
        recurrence: normalizeRecurrence(task.recurrence)
      }));
      this.subtasks = snapshot.subtasks ?? [];
      this.currentDate = snapshot.today ?? this.currentDate;
      this.tags = snapshot.tags;
      this.links = snapshot.links;
      this.attachments = snapshot.attachments;
    },
    async refresh() {
      this.status = "loading";
      try {
        await this.syncPending();
        this.apply(await loadSnapshot());
        await this.applyPendingProjection();
        this.status = "idle";
        await this.refreshPendingStatus();
      } catch (error) {
        const cached = cachedSnapshot();
        if (cached) {
          this.apply(cached);
          await this.applyPendingProjection();
          this.status = "offline";
          await this.refreshPendingStatus();
        } else {
          this.apply({ tasks: [], subtasks: [], tags: [], links: [], attachments: [], today: this.currentDate });
          await this.applyPendingProjection();
          if (this.pendingCount > 0) {
            this.status = "offline";
          } else {
            this.status = "error";
            this.error = error instanceof Error ? error.message : "Unable to load planner";
          }
        }
      }
    },
    tasksFor(date: string) {
      return plannerTasksForDate(this.tasks, date);
    },
    scheduledTasksFor(date: string) {
      return scheduledTasksForDate(this.tasks, date);
    },
    overdue() {
      return overdueTasks(this.tasks, this.currentDate);
    },
    allVisible(search = "", showCompleted = false) {
      const q = search.toLowerCase();
      return sortPlannerItems(this.tasks.filter((task) => !task.deletedAt && (showCompleted || !task.completedAt) && task.title.toLowerCase().includes(q)));
    },
    async createTask(title: string, dueDate?: string, parentId: string | null = null, tagIds: string[] = []) {
      const now = new Date().toISOString();
      const id = generateLocalId("task");
      const operationId = generateLocalId("op");
      const task: Task = { id, title, parentId, dueDate: dueDate ?? this.currentDate, completedAt: null, pinned: false, subtasksCollapsed: false, tagId: tagIds[0] ?? null, tagIds, notes: "", recurrence: { type: "none" }, order: Date.now(), createdAt: now, updatedAt: now, deletedAt: null };
      this.tasks.push(task);
      const saved = await this.writeOperation<Task>({
        operationId,
        entityType: "task",
        entityId: id,
        method: "POST",
        path: "/api/planner/tasks",
        body: { id, operationId, title, dueDate: task.dueDate, parentId, tagIds },
        state: "pending",
        retryable: true,
        createdAt: now,
        updatedAt: now
      });
      if (saved) this.tasks = this.tasks.map((candidate) => candidate.id === id ? saved : candidate);
      return saved ?? task;
    },
    async createSubtask(taskId: string, title: string) {
      const siblingSubtasks = this.subtasks.filter((subtask) => subtask.taskId === taskId && subtask.deletedAt === null);
      const nextOrder = siblingSubtasks.reduce((max, subtask) => Math.max(max, subtask.order), 0) + 1000;
      const now = new Date().toISOString();
      const id = generateLocalId("subtask");
      const operationId = generateLocalId("op");
      const local: Subtask = { id, taskId, title, completedAt: null, order: nextOrder, createdAt: now, updatedAt: now, deletedAt: null };
      this.subtasks.push(local);
      const subtask = await this.writeOperation<Subtask>({
        operationId,
        entityType: "subtask",
        entityId: id,
        method: "POST",
        path: "/api/planner/subtasks",
        body: { id, operationId, taskId, title, order: nextOrder },
        state: "pending",
        retryable: true,
        createdAt: now,
        updatedAt: now
      }) ?? local;
      this.subtasks = this.subtasks.map((candidate) => candidate.id === id ? subtask : candidate);
      const task = this.tasks.find((candidate) => candidate.id === taskId);
      if (task?.subtasksCollapsed) await this.setSubtasksCollapsed(taskId, false);
      return subtask;
    },
    async updateTask(id: string, patch: Partial<Task>) {
      const current = this.tasks.find((candidate) => candidate.id === id);
      if (!current) return await this.writeOperation<Task>({ operationId: generateLocalId("op"), entityType: "task", entityId: id, method: "PATCH", path: `/api/planner/tasks/${id}`, body: patch, state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      const optimistic = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? optimistic : candidate);
      const operationId = generateLocalId("op");
      const task = await this.writeOperation<Task>({ operationId, entityType: "task", entityId: id, method: "PATCH", path: `/api/planner/tasks/${id}`, body: { ...patch, operationId }, base: baseForPatch(current, patch), state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (task) this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
      return task ?? optimistic;
    },
    async updateSubtask(id: string, patch: Partial<Subtask>) {
      const current = this.subtasks.find((candidate) => candidate.id === id);
      if (!current) throw new Error("Subtask not found");
      const optimistic = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.subtasks = this.subtasks.map((candidate) => candidate.id === id ? optimistic : candidate);
      const operationId = generateLocalId("op");
      const subtask = await this.writeOperation<Subtask>({ operationId, entityType: "subtask", entityId: id, method: "PATCH", path: `/api/planner/subtasks/${id}`, body: { ...patch, operationId }, base: baseForPatch(current, patch), state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (subtask) this.subtasks = this.subtasks.map((candidate) => candidate.id === id ? subtask : candidate);
      return subtask ?? optimistic;
    },
    async completeTask(id: string) {
      const current = this.tasks.find((candidate) => candidate.id === id);
      if (!current) return;
      const completedAt = new Date().toISOString();
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? { ...candidate, completedAt, updatedAt: completedAt } : candidate);
      const operationId = generateLocalId("op");
      const task = await this.writeOperation<Task>({ operationId, entityType: "task", entityId: id, method: "POST", path: `/api/planner/tasks/${id}/complete`, body: { operationId, completedAt }, state: "pending", retryable: true, createdAt: completedAt, updatedAt: completedAt });
      if (task) this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
    },
    async toggleSubtask(id: string) {
      const subtask = this.subtasks.find((candidate) => candidate.id === id);
      if (!subtask) return;
      await this.updateSubtask(id, { completedAt: subtask.completedAt ? null : new Date().toISOString() });
    },
    async setSubtasksCollapsed(id: string, collapsed: boolean) {
      if (this.status === "offline" && !hasDurableOutbox()) {
        this.tasks = this.tasks.map((task) => task.id === id ? { ...task, subtasksCollapsed: collapsed } : task);
        return;
      }
      await this.updateTask(id, { subtasksCollapsed: collapsed });
    },
    async reorderTasks(tasks: Task[]) {
      const updates = tasks.map((task, index) => ({ ...task, order: (index + 1) * 1000 }));
      this.tasks = this.tasks.map((task) => updates.find((updated) => updated.id === task.id) ?? task);
      for (const task of updates) {
        await this.updateTask(task.id, { order: task.order });
      }
    },
    async reorderSubtasks(subtasks: Subtask[]) {
      const updates = subtasks.map((subtask, index) => ({ ...subtask, order: (index + 1) * 1000 }));
      this.subtasks = this.subtasks.map((subtask) => updates.find((updated) => updated.id === subtask.id) ?? subtask);
      for (const subtask of updates) {
        await this.updateSubtask(subtask.id, { order: subtask.order });
      }
    },
    async deleteTask(id: string) {
      const operationId = generateLocalId("op");
      await this.writeOperation<void>({ operationId, entityType: "task", entityId: id, method: "DELETE", path: `/api/planner/tasks/${id}`, body: { operationId }, state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      this.tasks = this.tasks.map((task) => task.id === id ? { ...task, deletedAt: new Date().toISOString() } : task);
      this.subtasks = this.subtasks.map((subtask) => subtask.taskId === id ? { ...subtask, deletedAt: new Date().toISOString() } : subtask);
    },
    async deleteSubtask(id: string) {
      const operationId = generateLocalId("op");
      await this.writeOperation<void>({ operationId, entityType: "subtask", entityId: id, method: "DELETE", path: `/api/planner/subtasks/${id}`, body: { operationId }, state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      this.subtasks = this.subtasks.map((subtask) => subtask.id === id ? { ...subtask, deletedAt: new Date().toISOString() } : subtask);
    },
    async createTag(name: string, color: string | null) {
      const now = new Date().toISOString();
      const id = generateLocalId("tag");
      const operationId = generateLocalId("op");
      const tag: Tag = { id, name, color, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null };
      this.tags.push(tag);
      const saved = await this.writeOperation<Tag>({ operationId, entityType: "tag", entityId: id, method: "POST", path: "/api/planner/tags", body: { id, operationId, name, color }, state: "pending", retryable: true, createdAt: now, updatedAt: now });
      if (saved) this.tags = this.tags.map((candidate) => candidate.id === id ? saved : candidate);
      return saved ?? tag;
    },
    async updateTag(id: string, patch: Partial<Tag>) {
      const current = this.tags.find((tag) => tag.id === id);
      if (!current) throw new Error("Tag not found");
      const optimistic = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.tags = this.tags.map((tag) => tag.id === id ? optimistic : tag);
      const operationId = generateLocalId("op");
      const saved = await this.writeOperation<Tag>({ operationId, entityType: "tag", entityId: id, method: "PATCH", path: `/api/planner/tags/${id}`, body: { ...patch, operationId }, base: baseForPatch(current, patch), state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (saved) this.tags = this.tags.map((tag) => tag.id === id ? saved : tag);
      return saved ?? optimistic;
    },
    async deleteTag(id: string) {
      const operationId = generateLocalId("op");
      await this.writeOperation<void>({ operationId, entityType: "tag", entityId: id, method: "DELETE", path: `/api/planner/tags/${id}`, body: { operationId }, state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      this.tags = this.tags.filter((tag) => tag.id !== id);
    },
    async createLink(taskId: string, url: string) {
      const now = new Date().toISOString();
      const id = generateLocalId("link");
      const operationId = generateLocalId("op");
      const link: TaskLink = { id, taskId, url, label: null, createdAt: now, deletedAt: null };
      this.links.push(link);
      const saved = await this.writeOperation<TaskLink>({ operationId, entityType: "link", entityId: id, method: "POST", path: "/api/planner/links", body: { id, operationId, taskId, url }, state: "pending", retryable: true, createdAt: now, updatedAt: now });
      if (saved) this.links = this.links.map((candidate) => candidate.id === id ? saved : candidate);
      return saved ?? link;
    },
    async deleteLink(id: string) {
      const operationId = generateLocalId("op");
      await this.writeOperation<void>({ operationId, entityType: "link", entityId: id, method: "DELETE", path: `/api/planner/links/${id}`, body: { operationId }, state: "pending", retryable: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      this.links = this.links.map((link) => link.id === id ? { ...link, deletedAt: new Date().toISOString() } : link);
    },
    async writeOperation<T>(operation: PendingOperation) {
      const isJsdom = typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
      if (isJsdom && !hasDurableOutbox()) return await this.writeOperationDirect<T>(operation);
      const compacted = await saveCompactedPendingOperation(operation);
      if (!compacted) {
        await this.refreshPendingStatus();
        return undefined;
      }
      await this.refreshPendingStatus();
      try {
        const session = useSessionStore();
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          if (shouldShowOfflineDialog()) this.savedOfflineDialogVisible = true;
          return undefined;
        }
        const response = await sendPendingOperationWithTimeout(compacted, session);
        if (response.status === 401) {
          session.lockLocal();
          await this.refreshPendingStatus();
          return undefined;
        }
        if (!response.ok) {
          await markPendingOperationFailed(compacted.operationId, response.status >= 500);
          await this.refreshPendingStatus();
          if (response.status >= 400 && response.status < 500) return undefined;
          throw new Error(await response.text());
        }
        await removePendingOperation(compacted.operationId);
        await this.refreshPendingStatus();
        return response.status === 204 ? undefined : await response.json() as T;
      } catch {
        if (shouldShowOfflineDialog()) this.savedOfflineDialogVisible = true;
        await this.refreshPendingStatus();
        return undefined;
      }
    },
    async writeOperationDirect<T>(operation: PendingOperation) {
      const body = { ...operation.body };
      delete body.operationId;
      delete body.id;
      if (operation.entityType === "task" && operation.method === "POST" && operation.path.endsWith("/complete")) return await plannerApi.completeTask(operation.entityId) as T;
      if (operation.entityType === "task" && operation.method === "POST") return await plannerApi.createTask(body as Partial<Task> & { title: string }) as T;
      if (operation.entityType === "task" && operation.method === "PATCH") return await plannerApi.updateTask(operation.entityId, body as Partial<Task>) as T;
      if (operation.entityType === "task" && operation.method === "DELETE") return await plannerApi.deleteTask(operation.entityId) as T;
      if (operation.entityType === "subtask" && operation.method === "POST") return await plannerApi.createSubtask(body as Pick<Subtask, "taskId" | "title"> & Partial<Subtask>) as T;
      if (operation.entityType === "subtask" && operation.method === "PATCH") return await plannerApi.updateSubtask(operation.entityId, body as Partial<Subtask>) as T;
      if (operation.entityType === "subtask" && operation.method === "DELETE") return await plannerApi.deleteSubtask(operation.entityId) as T;
      if (operation.entityType === "tag" && operation.method === "POST") return await plannerApi.createTag(body as Pick<Tag, "name"> & Partial<Tag>) as T;
      if (operation.entityType === "tag" && operation.method === "PATCH") return await plannerApi.updateTag(operation.entityId, body as Partial<Tag>) as T;
      if (operation.entityType === "tag" && operation.method === "DELETE") return await plannerApi.deleteTag(operation.entityId) as T;
      if (operation.entityType === "link" && operation.method === "POST") return await plannerApi.createLink(body as Pick<TaskLink, "taskId" | "url"> & Partial<TaskLink>) as T;
      if (operation.entityType === "link" && operation.method === "DELETE") return await plannerApi.deleteLink(operation.entityId) as T;
      return undefined as T;
    },
    async refreshPendingStatus() {
      const operations = await pendingOperations();
      this.pendingCount = operations.length;
      this.failedSyncCount = operations.filter((operation) => operation.state === "failed").length;
      this.pendingEntityStates = Object.fromEntries(operations.map((operation) => [operation.entityId, operation.state]));
    },
    async applyPendingProjection() {
      const operations = await pendingOperations();
      for (const operation of operations) {
        this.applyPendingOperation(operation);
      }
      await this.refreshPendingStatus();
    },
    applyPendingOperation(operation: PendingOperation) {
      if (operation.entityType === "task") {
        this.applyPendingTaskOperation(operation);
      } else if (operation.entityType === "subtask") {
        this.applyPendingSubtaskOperation(operation);
      } else if (operation.entityType === "tag") {
        this.applyPendingTagOperation(operation);
      } else if (operation.entityType === "link") {
        this.applyPendingLinkOperation(operation);
      }
    },
    applyPendingTaskOperation(operation: PendingOperation) {
      const existing = this.tasks.find((task) => task.id === operation.entityId);
      if (operation.method === "POST" && operation.path.endsWith("/complete")) {
        if (existing) this.tasks = this.tasks.map((task) => task.id === operation.entityId ? { ...task, completedAt: operation.body.completedAt as string ?? task.completedAt, updatedAt: operation.updatedAt } : task);
        return;
      }
      if (operation.method === "POST") {
        const task = taskFromPendingOperation(operation, existing);
        this.tasks = existing ? this.tasks.map((candidate) => candidate.id === task.id ? task : candidate) : [...this.tasks, task];
        return;
      }
      if (operation.method === "PATCH" && existing) {
        this.tasks = this.tasks.map((task) => task.id === operation.entityId ? normalizeTask({ ...task, ...bodyWithoutOperationId(operation.body), updatedAt: operation.updatedAt } as Task) : task);
        return;
      }
      if (operation.method === "DELETE" && existing) {
        this.tasks = this.tasks.map((task) => task.id === operation.entityId ? { ...task, deletedAt: operation.updatedAt } : task);
        this.subtasks = this.subtasks.map((subtask) => subtask.taskId === operation.entityId ? { ...subtask, deletedAt: operation.updatedAt } : subtask);
      }
    },
    applyPendingSubtaskOperation(operation: PendingOperation) {
      const existing = this.subtasks.find((subtask) => subtask.id === operation.entityId);
      if (operation.method === "POST") {
        const subtask = subtaskFromPendingOperation(operation, existing);
        this.subtasks = existing ? this.subtasks.map((candidate) => candidate.id === subtask.id ? subtask : candidate) : [...this.subtasks, subtask];
        return;
      }
      if (operation.method === "PATCH" && existing) {
        this.subtasks = this.subtasks.map((subtask) => subtask.id === operation.entityId ? { ...subtask, ...bodyWithoutOperationId(operation.body), updatedAt: operation.updatedAt } as Subtask : subtask);
        return;
      }
      if (operation.method === "DELETE" && existing) {
        this.subtasks = this.subtasks.map((subtask) => subtask.id === operation.entityId ? { ...subtask, deletedAt: operation.updatedAt } : subtask);
      }
    },
    applyPendingTagOperation(operation: PendingOperation) {
      const existing = this.tags.find((tag) => tag.id === operation.entityId);
      if (operation.method === "POST") {
        const tag = tagFromPendingOperation(operation, existing);
        this.tags = existing ? this.tags.map((candidate) => candidate.id === tag.id ? tag : candidate) : [...this.tags, tag];
        return;
      }
      if (operation.method === "PATCH" && existing) {
        this.tags = this.tags.map((tag) => tag.id === operation.entityId ? { ...tag, ...bodyWithoutOperationId(operation.body), updatedAt: operation.updatedAt } as Tag : tag);
        return;
      }
      if (operation.method === "DELETE" && existing) {
        this.tags = this.tags.map((tag) => tag.id === operation.entityId ? { ...tag, deletedAt: operation.updatedAt } : tag);
      }
    },
    applyPendingLinkOperation(operation: PendingOperation) {
      const existing = this.links.find((link) => link.id === operation.entityId);
      if (operation.method === "POST") {
        const link = linkFromPendingOperation(operation, existing);
        this.links = existing ? this.links.map((candidate) => candidate.id === link.id ? link : candidate) : [...this.links, link];
        return;
      }
      if (operation.method === "DELETE" && existing) {
        this.links = this.links.map((link) => link.id === operation.entityId ? { ...link, deletedAt: operation.updatedAt } : link);
      }
    },
    async syncPending() {
      const operations = await pendingOperations();
      for (const operation of operations) {
        if (operation.retryable === false) continue;
        try {
          const session = useSessionStore();
          const response = await sendPendingOperation(operation, session);
          if (response.status === 401) {
            session.lockLocal();
            break;
          }
          if (!response.ok) {
            await markPendingOperationFailed(operation.operationId, response.status >= 500);
            continue;
          }
          await removePendingOperation(operation.operationId);
        } catch {
          await markPendingOperationFailed(operation.operationId);
        }
      }
      await this.refreshPendingStatus();
    },
    dateForTab(tab: string) {
      if (tab === "today") return this.currentDate;
      if (tab === "tomorrow") return addDays(this.currentDate, 1);
      if (tab === "day-after") return addDays(this.currentDate, 2);
      return this.currentDate;
    }
  }
});

function baseForPatch<T extends Record<string, unknown>>(current: T, patch: Partial<T>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, current[key]]));
}

const immediateWriteTimeoutMs = 1500;

async function sendPendingOperationWithTimeout(operation: PendingOperation, session: ReturnType<typeof useSessionStore>): Promise<Response> {
  return await Promise.race([
    sendPendingOperation(operation, session),
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Write attempt timed out")), immediateWriteTimeoutMs))
  ]);
}

function bodyWithoutOperationId(body: Record<string, unknown>): Record<string, unknown> {
  const { operationId: _operationId, ...rest } = body;
  return rest;
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    tagIds: task.tagIds ?? (task.tagId ? [task.tagId] : []),
    subtasksCollapsed: task.subtasksCollapsed ?? false,
    recurrence: normalizeRecurrence(task.recurrence)
  };
}

function taskFromPendingOperation(operation: PendingOperation, existing?: Task): Task {
  const body = operation.body;
  return normalizeTask({
    id: operation.entityId,
    title: stringValue(body.title, existing?.title ?? "Untitled task"),
    parentId: nullableStringValue(body.parentId, existing?.parentId ?? null),
    dueDate: stringValue(body.dueDate, existing?.dueDate ?? todayISO()),
    completedAt: nullableStringValue(body.completedAt, existing?.completedAt ?? null),
    pinned: booleanValue(body.pinned, existing?.pinned ?? false),
    subtasksCollapsed: booleanValue(body.subtasksCollapsed, existing?.subtasksCollapsed ?? false),
    tagId: nullableStringValue(body.tagId, existing?.tagId ?? (Array.isArray(body.tagIds) ? body.tagIds[0] as string | undefined ?? null : null)),
    tagIds: Array.isArray(body.tagIds) ? body.tagIds.filter((tagId): tagId is string => typeof tagId === "string") : existing?.tagIds ?? [],
    notes: stringValue(body.notes, existing?.notes ?? ""),
    recurrence: typeof body.recurrence === "object" && body.recurrence !== null ? body.recurrence as Task["recurrence"] : existing?.recurrence ?? { type: "none" },
    order: numberValue(body.order, existing?.order ?? Date.parse(operation.createdAt)),
    createdAt: existing?.createdAt ?? operation.createdAt,
    updatedAt: operation.updatedAt,
    deletedAt: nullableStringValue(body.deletedAt, existing?.deletedAt ?? null)
  });
}

function subtaskFromPendingOperation(operation: PendingOperation, existing?: Subtask): Subtask {
  const body = operation.body;
  return {
    id: operation.entityId,
    taskId: stringValue(body.taskId, existing?.taskId ?? ""),
    title: stringValue(body.title, existing?.title ?? "Untitled subtask"),
    completedAt: nullableStringValue(body.completedAt, existing?.completedAt ?? null),
    order: numberValue(body.order, existing?.order ?? Date.parse(operation.createdAt)),
    createdAt: existing?.createdAt ?? operation.createdAt,
    updatedAt: operation.updatedAt,
    deletedAt: nullableStringValue(body.deletedAt, existing?.deletedAt ?? null)
  };
}

function tagFromPendingOperation(operation: PendingOperation, existing?: Tag): Tag {
  const body = operation.body;
  return {
    id: operation.entityId,
    name: stringValue(body.name, existing?.name ?? "Untitled tag"),
    color: nullableStringValue(body.color, existing?.color ?? null),
    archivedAt: nullableStringValue(body.archivedAt, existing?.archivedAt ?? null),
    createdAt: existing?.createdAt ?? operation.createdAt,
    updatedAt: operation.updatedAt,
    deletedAt: nullableStringValue(body.deletedAt, existing?.deletedAt ?? null)
  };
}

function linkFromPendingOperation(operation: PendingOperation, existing?: TaskLink): TaskLink {
  const body = operation.body;
  return {
    id: operation.entityId,
    taskId: stringValue(body.taskId, existing?.taskId ?? ""),
    url: stringValue(body.url, existing?.url ?? ""),
    label: nullableStringValue(body.label, existing?.label ?? null),
    createdAt: existing?.createdAt ?? operation.createdAt,
    deletedAt: nullableStringValue(body.deletedAt, existing?.deletedAt ?? null)
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}
