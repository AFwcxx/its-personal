import { linkInputSchema, nextDueDate, normalizeRecurrence, recurrenceEndsBeforeDueDate, subtaskInputSchema, subtaskPatchSchema, taskInputSchema, taskPatchSchema, tagInputSchema, todayISO, type Recurrence, type Subtask, type Task, type Tag, type TaskLink } from "@its-personal/shared";
import { Router, type Response } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Db } from "../db/connection.js";
import { getProcessedOperation, insertProcessedOperation, listAttachments, listLinks, listSubtasks, listTags, listTasks, softDelete, softDeleteSubtasksForTask, upsertLink, upsertSubtask, upsertTag, upsertTask } from "../db/repositories.js";
import type { PlannerChanges } from "../plannerChanges.js";

const subtaskReorderSchema = z.object({
  operationId: z.string().min(1).optional(),
  orderedIds: z.array(z.string().min(1)).min(1)
});

export function plannerRouter(db: Db, timezone = "UTC", changes?: PlannerChanges): Router {
  const router = Router();

  function replayOperation(operationId: unknown, res: Response): boolean {
    if (typeof operationId !== "string" || operationId.length === 0) return false;
    const processed = getProcessedOperation(db, operationId);
    if (!processed) return false;
    if (processed.response_json === null) {
      res.status(processed.status_code).end();
      return true;
    }
    res.status(processed.status_code).json(JSON.parse(processed.response_json));
    return true;
  }

  function rememberOperation(operationId: unknown, statusCode: number, response?: unknown): void {
    if (typeof operationId !== "string" || operationId.length === 0) return;
    insertProcessedOperation(db, operationId, statusCode, response);
  }

  router.get("/snapshot", (_req, res) => {
    res.json({ tasks: listTasks(db), subtasks: listSubtasks(db), tags: listTags(db), links: listLinks(db), attachments: listAttachments(db), today: todayISO(new Date(), timezone), timezone, changeVersion: changes?.current() ?? 0 });
  });

  router.get("/changes", (_req, res) => {
    res.json({ version: changes?.current() ?? 0 });
  });

  router.post("/tasks", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    const submittedId = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (replayOperation(operationId, res)) return;
    const parsed = taskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid task input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data as typeof parsed.data & { id?: string; operationId?: string };
    const now = new Date().toISOString();
    const task: Task = {
      id: submittedId ?? nanoid(),
      title: input.title,
      parentId: input.parentId ?? null,
      dueDate: input.dueDate,
      completedAt: null,
      pinned: input.pinned ?? false,
      subtasksCollapsed: input.subtasksCollapsed ?? false,
      tagId: input.tagId ?? null,
      tagIds: input.tagIds ?? (input.tagId ? [input.tagId] : []),
      notes: input.notes ?? "",
      recurrence: normalizeRecurrence(input.recurrence ?? { type: "none" }),
      order: input.order ?? Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    if (recurrenceEndsBeforeDueDate(task.dueDate, task.recurrence)) {
      res.status(400).json({ error: "Recurrence end date cannot be earlier than due date" });
      return;
    }
    const created = upsertTask(db, task);
    changes?.bump();
    rememberOperation(operationId, 201, created);
    res.status(201).json(created);
  });

  router.patch("/tasks/:id", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    if (replayOperation(operationId, res)) return;
    const current = listTasks(db).find((task) => task.id === req.params.id && task.deletedAt === null);
    if (!current) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const parsed = taskPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid task patch", issues: parsed.error.issues });
      return;
    }
    const patch = parsed.data as typeof parsed.data & { operationId?: string };
    const updated: Task = {
      ...current,
      title: patch.title ?? current.title,
      parentId: patch.parentId ?? current.parentId,
      dueDate: patch.dueDate ?? current.dueDate,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
      pinned: patch.pinned ?? current.pinned,
      subtasksCollapsed: patch.subtasksCollapsed ?? current.subtasksCollapsed,
      tagId: patch.tagId ?? current.tagId,
      tagIds: patch.tagIds ?? (patch.tagId !== undefined ? (patch.tagId ? [patch.tagId] : []) : current.tagIds),
      notes: patch.notes ?? current.notes,
      order: patch.order ?? current.order,
      deletedAt: patch.deletedAt ?? current.deletedAt,
      recurrence: normalizeRecurrence((patch.recurrence as Recurrence | undefined) ?? current.recurrence),
      updatedAt: new Date().toISOString()
    };
    if (recurrenceEndsBeforeDueDate(updated.dueDate, updated.recurrence)) {
      res.status(400).json({ error: "Recurrence end date cannot be earlier than due date" });
      return;
    }
    const saved = upsertTask(db, updated);
    changes?.bump();
    rememberOperation(operationId, 200, saved);
    res.json(saved);
  });

  router.post("/tasks/:id/complete", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    const tasks = listTasks(db);
    const subtasks = listSubtasks(db);
    const task = tasks.find((candidate) => candidate.id === req.params.id && candidate.deletedAt === null);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const hasOpenSubtask = subtasks.some((candidate) => candidate.taskId === task.id && candidate.completedAt === null && candidate.deletedAt === null);
    if (hasOpenSubtask) {
      res.status(409).json({ error: "Complete subtasks first" });
      return;
    }
    const now = new Date().toISOString();
    const completed = upsertTask(db, { ...task, completedAt: now, updatedAt: now });
    const recurringDueDate = nextDueDate(task.dueDate, task.recurrence);
    if (recurringDueDate) {
      const nextTask = upsertTask(db, { ...task, id: nanoid(), dueDate: recurringDueDate, completedAt: null, subtasksCollapsed: false, createdAt: now, updatedAt: now });
      for (const subtask of subtasks.filter((candidate) => candidate.taskId === task.id && candidate.deletedAt === null)) {
        upsertSubtask(db, {
          ...subtask,
          id: nanoid(),
          taskId: nextTask.id,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        });
      }
    }
    changes?.bump();
    rememberOperation(req.body?.operationId, 200, completed);
    res.json(completed);
  });

  router.delete("/tasks/:id", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    const now = new Date().toISOString();
    softDelete(db, "tasks", req.params.id, now);
    softDeleteSubtasksForTask(db, req.params.id, now);
    changes?.bump();
    rememberOperation(req.body?.operationId, 204);
    res.status(204).end();
  });

  router.post("/subtasks", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    const submittedId = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (replayOperation(operationId, res)) return;
    const parsed = subtaskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid subtask input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data as typeof parsed.data & { id?: string; operationId?: string };
    const task = listTasks(db).find((candidate) => candidate.id === input.taskId && candidate.deletedAt === null);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const now = new Date().toISOString();
    const siblingSubtasks = listSubtasks(db).filter((candidate) => candidate.taskId === input.taskId && candidate.deletedAt === null);
    const nextOrder = siblingSubtasks.reduce((max, candidate) => Math.max(max, candidate.order), 0) + 1000;
    const subtask: Subtask = {
      id: submittedId ?? nanoid(),
      taskId: input.taskId,
      title: input.title,
      completedAt: null,
      order: input.order ?? nextOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const created = upsertSubtask(db, subtask);
    changes?.bump();
    rememberOperation(operationId, 201, created);
    res.status(201).json(created);
  });

  router.patch("/tasks/:taskId/subtasks/order", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    if (replayOperation(operationId, res)) return;
    const task = listTasks(db).find((candidate) => candidate.id === req.params.taskId && candidate.deletedAt === null);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const parsed = subtaskReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid subtask reorder input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const activeSiblings = listSubtasks(db).filter((candidate) => candidate.taskId === req.params.taskId && candidate.deletedAt === null);
    const siblingIds = new Set(activeSiblings.map((subtask) => subtask.id));
    const requestedIds = new Set(input.orderedIds);
    if (requestedIds.size !== input.orderedIds.length || requestedIds.size !== siblingIds.size || input.orderedIds.some((id) => !siblingIds.has(id))) {
      res.status(400).json({ error: "Subtask reorder must include each active sibling exactly once" });
      return;
    }
    const byId = new Map(activeSiblings.map((subtask) => [subtask.id, subtask]));
    const now = new Date().toISOString();
    const reorder = db.transaction((orderedIds: string[]) => orderedIds.map((id, index) => upsertSubtask(db, { ...byId.get(id)!, order: (index + 1) * 1000, updatedAt: now })));
    const reordered = reorder(input.orderedIds);
    changes?.bump();
    rememberOperation(operationId, 200, reordered);
    res.json(reordered);
  });

  router.patch("/subtasks/:id", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    if (replayOperation(operationId, res)) return;
    const current = listSubtasks(db).find((candidate) => candidate.id === req.params.id && candidate.deletedAt === null);
    if (!current) {
      res.status(404).json({ error: "Subtask not found" });
      return;
    }
    const parsed = subtaskPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid subtask patch", issues: parsed.error.issues });
      return;
    }
    const patch = parsed.data as typeof parsed.data & { operationId?: string };
    const updated: Subtask = {
      ...current,
      title: patch.title ?? current.title,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
      order: patch.order ?? current.order,
      deletedAt: patch.deletedAt ?? current.deletedAt,
      updatedAt: new Date().toISOString()
    };
    const saved = upsertSubtask(db, updated);
    changes?.bump();
    rememberOperation(operationId, 200, saved);
    res.json(saved);
  });

  router.delete("/subtasks/:id", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    softDelete(db, "subtasks", req.params.id, new Date().toISOString());
    changes?.bump();
    rememberOperation(req.body?.operationId, 204);
    res.status(204).end();
  });

  router.post("/tags", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    const submittedId = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (replayOperation(operationId, res)) return;
    const input = tagInputSchema.parse(req.body) as ReturnType<typeof tagInputSchema.parse> & { id?: string; operationId?: string };
    const now = new Date().toISOString();
    const tag: Tag = { id: submittedId ?? nanoid(), name: input.name, color: input.color ?? null, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null };
    const created = upsertTag(db, tag);
    changes?.bump();
    rememberOperation(operationId, 201, created);
    res.status(201).json(created);
  });

  router.patch("/tags/:id", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    if (replayOperation(operationId, res)) return;
    const current = listTags(db).find((tag) => tag.id === req.params.id);
    if (!current) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    const input = tagInputSchema.partial().parse(req.body);
    const archivedAt = req.body.archivedAt === null || typeof req.body.archivedAt === "string" ? req.body.archivedAt : current.archivedAt;
    const deletedAt = req.body.deletedAt === null || typeof req.body.deletedAt === "string" ? req.body.deletedAt : current.deletedAt;
    const saved = upsertTag(db, {
      ...current,
      name: input.name ?? current.name,
      color: input.color ?? current.color,
      archivedAt,
      deletedAt,
      updatedAt: new Date().toISOString()
    });
    changes?.bump();
    rememberOperation(operationId, 200, saved);
    res.json(saved);
  });

  router.delete("/tags/:id", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    softDelete(db, "tags", req.params.id, new Date().toISOString());
    changes?.bump();
    rememberOperation(req.body?.operationId, 204);
    res.status(204).end();
  });

  router.post("/links", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    const submittedId = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (replayOperation(operationId, res)) return;
    const input = linkInputSchema.parse(req.body) as ReturnType<typeof linkInputSchema.parse> & { id?: string; operationId?: string };
    const link: TaskLink = { id: submittedId ?? nanoid(), taskId: input.taskId, url: input.url, label: input.label ?? null, createdAt: new Date().toISOString(), deletedAt: null };
    const created = upsertLink(db, link);
    changes?.bump();
    rememberOperation(operationId, 201, created);
    res.status(201).json(created);
  });

  router.delete("/links/:id", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    softDelete(db, "links", req.params.id, new Date().toISOString());
    changes?.bump();
    rememberOperation(req.body?.operationId, 204);
    res.status(204).end();
  });

  return router;
}
