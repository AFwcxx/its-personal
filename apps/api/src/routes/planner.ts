import { linkInputSchema, nextDueDate, taskInputSchema, taskPatchSchema, tagInputSchema, todayISO, type Recurrence, type Task, type Tag, type TaskLink } from "@its-personal/shared";
import { Router } from "express";
import { nanoid } from "nanoid";
import type { Db } from "../db/connection.js";
import { listAttachments, listLinks, listTags, listTasks, softDelete, upsertLink, upsertTag, upsertTask } from "../db/repositories.js";

export function plannerRouter(db: Db): Router {
  const router = Router();

  router.get("/snapshot", (_req, res) => {
    res.json({ tasks: listTasks(db), tags: listTags(db), links: listLinks(db), attachments: listAttachments(db) });
  });

  router.post("/tasks", (req, res) => {
    const input = taskInputSchema.parse(req.body);
    const now = new Date().toISOString();
    const task: Task = {
      id: nanoid(),
      title: input.title,
      parentId: input.parentId ?? null,
      dueDate: input.dueDate ?? todayISO(),
      completedAt: null,
      pinned: input.pinned ?? false,
      tagId: input.tagId ?? null,
      tagIds: input.tagIds ?? (input.tagId ? [input.tagId] : []),
      notes: input.notes ?? "",
      recurrence: input.recurrence ?? { type: "none" },
      order: input.order ?? Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    res.status(201).json(upsertTask(db, task));
  });

  router.patch("/tasks/:id", (req, res) => {
    const current = listTasks(db).find((task) => task.id === req.params.id && task.deletedAt === null);
    if (!current) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const patch = taskPatchSchema.parse(req.body);
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
      recurrence: (patch.recurrence as Recurrence | undefined) ?? current.recurrence,
      updatedAt: new Date().toISOString()
    };
    res.json(upsertTask(db, updated));
  });

  router.post("/tasks/:id/complete", (req, res) => {
    const tasks = listTasks(db);
    const task = tasks.find((candidate) => candidate.id === req.params.id && candidate.deletedAt === null);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const hasOpenChild = tasks.some((candidate) => candidate.parentId === task.id && candidate.completedAt === null && candidate.deletedAt === null);
    if (hasOpenChild) {
      res.status(409).json({ error: "Complete subtasks first" });
      return;
    }
    const now = new Date().toISOString();
    const completed = upsertTask(db, { ...task, completedAt: now, updatedAt: now });
    const recurringDueDate = task.dueDate ? nextDueDate(task.dueDate, task.recurrence) : null;
    if (recurringDueDate) {
      upsertTask(db, { ...task, id: nanoid(), dueDate: recurringDueDate, completedAt: null, createdAt: now, updatedAt: now });
    }
    res.json(completed);
  });

  router.delete("/tasks/:id", (req, res) => {
    softDelete(db, "tasks", req.params.id, new Date().toISOString());
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
