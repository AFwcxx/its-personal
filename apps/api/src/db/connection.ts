import Database from "better-sqlite3";
import { normalizeRecurrence } from "@its-personal/shared";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./schema.js";

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  normalizeStoredRecurrences(db);
  return db;
}

function normalizeStoredRecurrences(db: Db): void {
  const rows = db.prepare("SELECT id, recurrence_json FROM tasks").all() as { id: string; recurrence_json: string }[];
  const update = db.prepare("UPDATE tasks SET recurrence_json = ? WHERE id = ?");
  for (const row of rows) {
    const normalized = JSON.stringify(normalizeRecurrence(JSON.parse(row.recurrence_json)));
    if (normalized !== row.recurrence_json) update.run(normalized, row.id);
  }
}
