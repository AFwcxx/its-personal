import { describe, expect, it } from "vitest";
import request from "supertest";
import { issueSession, verifyPassword, verifySession } from "../src/auth/session.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/connection.js";
import { listTasks, upsertTask } from "../src/db/repositories.js";
import { createServer } from "../src/server.js";

const config = loadConfig({
  APP_PASSWORD: "secret",
  SESSION_SECRET: "test-secret-with-enough-length",
  APP_TIMEZONE: "Asia/Kuala_Lumpur",
  DATABASE_PATH: ":memory:",
  ATTACHMENT_DIR: "./attachments-test",
  MAX_ATTACHMENT_BYTES: "1000000",
  MAX_TOTAL_ATTACHMENT_BYTES: "1000000",
  PORT: "3000",
  HOST: "127.0.0.1"
});

describe("auth and database", () => {
  it("issues verifiable daily sessions only after password verification", () => {
    expect(verifyPassword(config, "wrong")).toBe(false);
    expect(verifyPassword(config, "secret")).toBe(true);
    const session = issueSession(config, "test-device", new Date("2026-05-20T12:00:00.000Z"));
    expect(verifySession(config, session.token).deviceId).toBe("test-device");
  });

  it("persists planner tasks in SQLite", () => {
    const db = openDatabase(":memory:");
    upsertTask(db, {
      id: "task-1",
      title: "Buy groceries",
      parentId: null,
      dueDate: "2026-05-20",
      completedAt: null,
      pinned: true,
      tagId: null,
      tagIds: [],
      notes: "",
      recurrence: { type: "none" },
      order: 1,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });
    expect(listTasks(db).map((task) => task.title)).toEqual(["Buy groceries"]);
  });

  it("preserves explicit null task patches so completed tasks can be reopened", async () => {
    const db = openDatabase(":memory:");
    upsertTask(db, {
      id: "task-1",
      title: "Completed task",
      parentId: null,
      dueDate: "2026-05-20",
      completedAt: "2026-05-20T01:00:00.000Z",
      pinned: true,
      tagId: null,
      tagIds: [],
      notes: "",
      recurrence: { type: "none" },
      order: 1,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });
    const token = issueSession(config, "test-device").token;

    await request(createServer(config, db))
      .patch("/api/planner/tasks/task-1")
      .set("authorization", `Bearer ${token}`)
      .send({ completedAt: null })
      .expect(200)
      .expect((response) => {
        expect(response.body.completedAt).toBeNull();
      });
  });

  it("rejects task creation without a due date", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, "test-device").token;

    await request(createServer(config, db))
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ title: "No date" })
      .expect(400);
  });

  it("rejects recurrence end dates before the task due date", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, "test-device").token;

    await request(createServer(config, db))
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({
        title: "Invalid recurrence",
        dueDate: "2026-05-20",
        recurrence: { type: "weekly", ends: { type: "date", date: "2026-05-19" } }
      })
      .expect(400);
  });
});
