import { normalizeRecurrence, type Attachment, type Subtask, type Tag, type Task, type TaskLink } from "@its-personal/shared";
import type { Db } from "./connection.js";

type TaskRow = {
  id: string; title: string; parent_id: string | null; due_date: string; completed_at: string | null;
  pinned: number; subtasks_collapsed: number; tag_id: string | null; notes: string; recurrence_json: string; sort_order: number;
  created_at: string; updated_at: string; deleted_at: string | null;
};
type SubtaskRow = {
  id: string; task_id: string; title: string; completed_at: string | null; sort_order: number;
  created_at: string; updated_at: string; deleted_at: string | null;
};
type TagRow = { id: string; name: string; color: string | null; archived_at: string | null; created_at: string; updated_at: string; deleted_at: string | null };
type LinkRow = { id: string; task_id: string; url: string; label: string | null; created_at: string; deleted_at: string | null };
type AttachmentRow = { id: string; task_id: string; original_name: string; stored_name: string; mime_type: string; size: number; checksum: string; created_at: string; deleted_at: string | null };
export type SessionRow = {
  id: string;
  device_id: string;
  password_fingerprint: string;
  created_at: string;
  last_seen_at: string;
  invalidated_at: string | null;
};

export function rowToTask(row: TaskRow, tagIds: string[] = []): Task {
  const taskTagIds = tagIds.length > 0 ? tagIds : row.tag_id ? [row.tag_id] : [];
  return {
    id: row.id,
    title: row.title,
    parentId: row.parent_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    pinned: row.pinned === 1,
    subtasksCollapsed: row.subtasks_collapsed === 1,
    tagId: row.tag_id,
    tagIds: taskTagIds,
    notes: row.notes,
    recurrence: normalizeRecurrence(JSON.parse(row.recurrence_json)),
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export function listTasks(db: Db): Task[] {
  const tagRows = db.prepare("SELECT task_id, tag_id FROM task_tags ORDER BY created_at ASC").all() as { task_id: string; tag_id: string }[];
  const tagsByTask = new Map<string, string[]>();
  for (const row of tagRows) {
    tagsByTask.set(row.task_id, [...(tagsByTask.get(row.task_id) ?? []), row.tag_id]);
  }
  return db.prepare("SELECT * FROM tasks ORDER BY pinned DESC, sort_order ASC, created_at ASC")
    .all()
    .map((row) => rowToTask(row as TaskRow, tagsByTask.get((row as TaskRow).id)));
}

export function getTask(db: Db, id: string): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function upsertTask(db: Db, task: Task): Task {
  const tagIds = task.tagIds.length > 0 ? task.tagIds : task.tagId ? [task.tagId] : [];
  db.prepare(`
    INSERT INTO tasks (id, title, parent_id, due_date, completed_at, pinned, subtasks_collapsed, tag_id, notes, recurrence_json, sort_order, created_at, updated_at, deleted_at)
    VALUES (@id, @title, @parentId, @dueDate, @completedAt, @pinned, @subtasksCollapsed, @tagId, @notes, @recurrence, @order, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET title=@title, parent_id=@parentId, due_date=@dueDate, completed_at=@completedAt,
      pinned=@pinned, subtasks_collapsed=@subtasksCollapsed, tag_id=@tagId, notes=@notes, recurrence_json=@recurrence, sort_order=@order, updated_at=@updatedAt, deleted_at=@deletedAt
  `).run({ ...task, tagId: tagIds[0] ?? null, pinned: task.pinned ? 1 : 0, subtasksCollapsed: task.subtasksCollapsed ? 1 : 0, recurrence: JSON.stringify(task.recurrence) });
  db.prepare("DELETE FROM task_tags WHERE task_id = ?").run(task.id);
  const insertTag = db.prepare("INSERT INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)");
  for (const tagId of tagIds) insertTag.run(task.id, tagId, task.updatedAt);
  return { ...task, tagId: tagIds[0] ?? null, tagIds };
}

export function rowToSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    completedAt: row.completed_at,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export function listSubtasks(db: Db): Subtask[] {
  return db.prepare("SELECT * FROM subtasks ORDER BY sort_order ASC, created_at ASC")
    .all()
    .map((row) => rowToSubtask(row as SubtaskRow));
}

export function upsertSubtask(db: Db, subtask: Subtask): Subtask {
  db.prepare(`
    INSERT INTO subtasks (id, task_id, title, completed_at, sort_order, created_at, updated_at, deleted_at)
    VALUES (@id, @taskId, @title, @completedAt, @order, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET task_id=@taskId, title=@title, completed_at=@completedAt,
      sort_order=@order, updated_at=@updatedAt, deleted_at=@deletedAt
  `).run(subtask);
  return subtask;
}

export function softDeleteSubtasksForTask(db: Db, taskId: string, now: string): void {
  db.prepare("UPDATE subtasks SET deleted_at = ?, updated_at = ? WHERE task_id = ? AND deleted_at IS NULL").run(now, now, taskId);
}

export function rowToTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color, archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at };
}

export function listTags(db: Db): Tag[] {
  return db.prepare("SELECT * FROM tags ORDER BY name").all().map((row) => rowToTag(row as TagRow));
}

export function upsertTag(db: Db, tag: Tag): Tag {
  db.prepare(`
    INSERT INTO tags (id, name, color, archived_at, created_at, updated_at, deleted_at)
    VALUES (@id, @name, @color, @archivedAt, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET name=@name, color=@color, archived_at=@archivedAt, updated_at=@updatedAt, deleted_at=@deletedAt
  `).run(tag);
  return tag;
}

export function rowToLink(row: LinkRow): TaskLink {
  return { id: row.id, taskId: row.task_id, url: row.url, label: row.label, createdAt: row.created_at, deletedAt: row.deleted_at };
}

export function listLinks(db: Db): TaskLink[] {
  return db.prepare("SELECT * FROM links ORDER BY created_at").all().map((row) => rowToLink(row as LinkRow));
}

export function upsertLink(db: Db, link: TaskLink): TaskLink {
  db.prepare(`
    INSERT INTO links (id, task_id, url, label, created_at, deleted_at)
    VALUES (@id, @taskId, @url, @label, @createdAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET task_id=@taskId, url=@url, label=@label, deleted_at=@deletedAt
  `).run(link);
  return link;
}

export function rowToAttachment(row: AttachmentRow): Attachment {
  return { id: row.id, taskId: row.task_id, originalName: row.original_name, storedName: row.stored_name, mimeType: row.mime_type, size: row.size, checksum: row.checksum, createdAt: row.created_at, deletedAt: row.deleted_at };
}

export function listAttachments(db: Db): Attachment[] {
  return db.prepare("SELECT * FROM attachments ORDER BY created_at").all().map((row) => rowToAttachment(row as AttachmentRow));
}

export function getAttachment(db: Db, id: string): Attachment | null {
  const row = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as AttachmentRow | undefined;
  return row ? rowToAttachment(row) : null;
}

export function insertAttachment(db: Db, attachment: Attachment): Attachment {
  db.prepare(`
    INSERT INTO attachments (id, task_id, original_name, stored_name, mime_type, size, checksum, created_at, deleted_at)
    VALUES (@id, @taskId, @originalName, @storedName, @mimeType, @size, @checksum, @createdAt, @deletedAt)
  `).run(attachment);
  return attachment;
}

export function insertSession(db: Db, session: SessionRow): SessionRow {
  db.prepare(`
    INSERT INTO sessions (id, device_id, password_fingerprint, created_at, last_seen_at, invalidated_at)
    VALUES (@id, @device_id, @password_fingerprint, @created_at, @last_seen_at, @invalidated_at)
  `).run(session);
  return session;
}

export function getSession(db: Db, id: string): SessionRow | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ?? null;
}

export function touchSession(db: Db, id: string, now: string): void {
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ? AND invalidated_at IS NULL").run(now, id);
}

export function invalidateSession(db: Db, id: string, now: string): void {
  db.prepare("UPDATE sessions SET invalidated_at = COALESCE(invalidated_at, ?) WHERE id = ?").run(now, id);
}

export function softDelete(db: Db, table: "tasks" | "subtasks" | "tags" | "links" | "attachments", id: string, now: string): void {
  db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ?`).run(now, id);
}
