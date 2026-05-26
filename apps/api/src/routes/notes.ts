import { noteInputSchema, notePatchSchema, type Note } from "@its-personal/shared";
import { Router, type Response } from "express";
import { nanoid } from "nanoid";
import type { Db } from "../db/connection.js";
import { getProcessedOperation, insertProcessedOperation, listNotes, listTags, softDelete, upsertNote } from "../db/repositories.js";
import type { PlannerChanges } from "../plannerChanges.js";

export function notesRouter(db: Db, changes?: PlannerChanges): Router {
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
    res.json({ notes: listNotes(db), tags: listTags(db), changeVersion: changes?.current() ?? 0 });
  });

  router.get("/changes", (_req, res) => {
    res.json({ version: changes?.current() ?? 0 });
  });

  router.post("/", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    const submittedId = typeof req.body?.id === "string" ? req.body.id : undefined;
    if (replayOperation(operationId, res)) return;
    const parsed = noteInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid note input", issues: parsed.error.issues });
      return;
    }
    const input = parsed.data as typeof parsed.data & { id?: string; operationId?: string };
    const now = new Date().toISOString();
    const note: Note = {
      id: submittedId ?? nanoid(),
      title: input.title,
      content: input.content,
      contentStyle: input.contentStyle,
      items: input.items,
      pinned: input.pinned ?? false,
      tagIds: input.tagIds ?? [],
      order: input.order ?? Date.now(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const created = upsertNote(db, note);
    changes?.bump();
    rememberOperation(operationId, 201, created);
    res.status(201).json(created);
  });

  router.patch("/:id", (req, res) => {
    const operationId = typeof req.body?.operationId === "string" ? req.body.operationId : undefined;
    if (replayOperation(operationId, res)) return;
    const current = listNotes(db).find((note) => note.id === req.params.id && note.deletedAt === null);
    if (!current) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    const parsed = notePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid note patch", issues: parsed.error.issues });
      return;
    }
    const patch = parsed.data as typeof parsed.data & { operationId?: string };
    const updated: Note = {
      ...current,
      title: patch.title ?? current.title,
      content: patch.content ?? current.content,
      contentStyle: patch.contentStyle ?? current.contentStyle,
      items: patch.items ?? current.items,
      pinned: patch.pinned ?? current.pinned,
      tagIds: patch.tagIds ?? current.tagIds,
      order: patch.order ?? current.order,
      deletedAt: patch.deletedAt ?? current.deletedAt,
      updatedAt: new Date().toISOString()
    };
    const saved = upsertNote(db, updated);
    changes?.bump();
    rememberOperation(operationId, 200, saved);
    res.json(saved);
  });

  router.delete("/:id", (req, res) => {
    if (replayOperation(req.body?.operationId, res)) return;
    softDelete(db, "notes", req.params.id, new Date().toISOString());
    changes?.bump();
    rememberOperation(req.body?.operationId, 204);
    res.status(204).end();
  });

  return router;
}
