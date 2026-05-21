import { linkInputSchema, nextDueDate, normalizeRecurrence, recurrenceEndsBeforeDueDate, subtaskInputSchema, subtaskPatchSchema, taskInputSchema, taskPatchSchema, tagInputSchema, todayISO, type Recurrence, type Subtask, type Task, type Tag, type TaskLink } from "@its-personal/shared";
import { Router } from "express";
import { nanoid } from "nanoid";
import type { Db } from "../db/connection.js";
import { listAttachments, listLinks, listSubtasks, listTags, listTasks, softDelete, softDeleteSubtasksForTask, upsertLink, upsertSubtask, upsertTag, upsertTask } from "../db/repositories.js";

export function plannerRouter(db: Db, timezone = "UTC"): Router {
  const router = Router();

  router.get("/snapshot", (_req, res) => {
    res.json({ tasks: listTasks(db), subtasks: listSubtasks(db), tags: listTags(db), links: listLinks(db), attachments: listAttachments(db), today: todayISO(new Date(), timezone), timezone });
  });

  router.post("/tasks", (req, res) => {
    const parsed = taskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid task input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const now = new Date().toISOString();
    const task: Task = {
      id: nanoid(),
      title: input.title,
      parentId: input.parentId ?? null,
      dueDate: input.dueDate,
      completedAt: null,
      pinned: input.pinned ?? false,
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
    res.status(201).json(upsertTask(db, task));
  });

  router.patch("/tasks/:id", (req, res) => {
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
    const patch = parsed.data;
    const updated: Task = {
      ...current,
      title: patch.title ?? current.title,
      parentId: patch.parentId ?? current.parentId,
      dueDate: patch.dueDate ?? current.dueDate,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
      pinned: patch.pinned ?? current.pinned,
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
    res.json(upsertTask(db, updated));
  });

  router.post("/tasks/:id/complete", (req, res) => {
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
      const nextTask = upsertTask(db, { ...task, id: nanoid(), dueDate: recurringDueDate, completedAt: null, createdAt: now, updatedAt: now });
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
    res.json(completed);
  });

  router.delete("/tasks/:id", (req, res) => {
    const now = new Date().toISOString();
    softDelete(db, "tasks", req.params.id, now);
    softDeleteSubtasksForTask(db, req.params.id, now);
    res.status(204).end();
  });

  router.post("/subtasks", (req, res) => {
    const parsed = subtaskInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid subtask input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data;
    const task = listTasks(db).find((candidate) => candidate.id === input.taskId && candidate.deletedAt === null);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const now = new Date().toISOString();
    const subtask: Subtask = {
      id: nanoid(),
      taskId: input.taskId,
      title: input.title,
      completedAt: null,
      order: input.order ?? Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    res.status(201).json(upsertSubtask(db, subtask));
  });

  router.patch("/subtasks/:id", (req, res) => {
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
    const patch = parsed.data;
    const updated: Subtask = {
      ...current,
      title: patch.title ?? current.title,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : current.completedAt,
      order: patch.order ?? current.order,
      deletedAt: patch.deletedAt ?? current.deletedAt,
      updatedAt: new Date().toISOString()
    };
    res.json(upsertSubtask(db, updated));
  });

  router.delete("/subtasks/:id", (req, res) => {
    softDelete(db, "subtasks", req.params.id, new Date().toISOString());
    res.status(204).end();
  });

  router.post("/tags", (req, res) => {
    const input = tagInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const tag: Tag = { id: nanoid(), name: input.name, color: input.color ?? null, archivedAt: null, createdAt: now, updatedAt: now, deletedAt: null };
    res.status(201).json(upsertTag(db, tag));
  });

  router.patch("/tags/:id", (req, res) => {
    const current = listTags(db).find((tag) => tag.id === req.params.id);
    if (!current) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    const input = tagInputSchema.partial().parse(req.body);
    const archivedAt = req.body.archivedAt === null || typeof req.body.archivedAt === "string" ? req.body.archivedAt : current.archivedAt;
    const deletedAt = req.body.deletedAt === null || typeof req.body.deletedAt === "string" ? req.body.deletedAt : current.deletedAt;
    res.json(upsertTag(db, {
      ...current,
      name: input.name ?? current.name,
      color: input.color ?? current.color,
      archivedAt,
      deletedAt,
      updatedAt: new Date().toISOString()
    }));
  });

  router.delete("/tags/:id", (req, res) => {
    softDelete(db, "tags", req.params.id, new Date().toISOString());
    res.status(204).end();
  });

  router.post("/links", (req, res) => {
    const input = linkInputSchema.parse(req.body);
    const link: TaskLink = { id: nanoid(), taskId: input.taskId, url: input.url, label: input.label ?? null, createdAt: new Date().toISOString(), deletedAt: null };
    res.status(201).json(upsertLink(db, link));
  });

  router.delete("/links/:id", (req, res) => {
    softDelete(db, "links", req.params.id, new Date().toISOString());
    res.status(204).end();
  });

  return router;
}
