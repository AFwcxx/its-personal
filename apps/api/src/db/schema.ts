import type { Db } from "./connection.js";

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      parent_id TEXT,
      due_date TEXT NOT NULL,
      completed_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      subtasks_collapsed INTEGER NOT NULL DEFAULT 0,
      tag_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      recurrence_json TEXT NOT NULL DEFAULT '{"type":"none"}',
      sort_order REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      completed_at TEXT,
      sort_order REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(task_id, tag_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id),
      FOREIGN KEY(tag_id) REFERENCES tags(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_links_task_id ON links(task_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      password_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      invalidated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);
  `);
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskColumns.some((column) => column.name === "subtasks_collapsed")) {
    db.prepare("ALTER TABLE tasks ADD COLUMN subtasks_collapsed INTEGER NOT NULL DEFAULT 0").run();
  }
}
