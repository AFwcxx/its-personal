import { describe, expect, it } from "vitest";
import request from "supertest";
import { issueSession, verifyPassword, verifySession } from "../src/auth/session.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/connection.js";
import { listSubtasks, listTasks, upsertSubtask, upsertTask } from "../src/db/repositories.js";
import { createServer } from "../src/server.js";

const config = loadConfig({
  APP_PASSWORD: "secret",
  SESSION_SECRET: "test-secret-with-enough-length",
  SESSION_IDLE_TIMEOUT_SECONDS: "10800",
  APP_TIMEZONE: "Asia/Kuala_Lumpur",
  DATABASE_PATH: ":memory:",
  ATTACHMENT_DIR: "./attachments-test",
  MAX_ATTACHMENT_BYTES: "1000000",
  MAX_TOTAL_ATTACHMENT_BYTES: "1000000",
  PORT: "3000",
  HOST: "127.0.0.1"
});

function taskFixture(id: string, patch: Partial<Parameters<typeof upsertTask>[1]> = {}): Parameters<typeof upsertTask>[1] {
  return {
    id,
    title: "Task",
    parentId: null,
    dueDate: "2026-05-20",
    completedAt: null,
    pinned: false,
    tagId: null,
    tagIds: [],
    notes: "",
    recurrence: { type: "none" },
    order: 1,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    deletedAt: null,
    ...patch
  };
}

describe("auth and database", () => {
  it("exposes the configured app title before unlock", async () => {
    const db = openDatabase(":memory:");
    const titledConfig = { ...config, APP_TITLE: "Personal Ops" };

    await request(createServer(titledConfig, db))
      .get("/api/config")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ appTitle: "Personal Ops" });
      });
  });

  it("issues verifiable idle sessions only after password verification", () => {
    expect(verifyPassword(config, "wrong")).toBe(false);
    expect(verifyPassword(config, "secret")).toBe(true);
    const db = openDatabase(":memory:");
    const session = issueSession(config, db, "test-device", new Date("2026-05-20T12:00:00.000Z"));
    expect(verifySession(config, db, session.token, new Date("2026-05-20T14:00:00.000Z")).deviceId).toBe("test-device");
    expect(() => verifySession(config, db, session.token, new Date("2026-05-20T17:00:01.000Z"))).toThrow();
  });

  it("rejects existing sessions after the app password changes", () => {
    const db = openDatabase(":memory:");
    const session = issueSession(config, db, "test-device", new Date("2026-05-20T12:00:00.000Z"));
    const changedPasswordConfig = { ...config, APP_PASSWORD: "changed-secret" };

    expect(() => verifySession(changedPasswordConfig, db, session.token, new Date("2026-05-20T12:01:00.000Z"))).toThrow();
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
    const token = issueSession(config, db, "test-device").token;

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
    const token = issueSession(config, db, "test-device").token;

    await request(createServer(config, db))
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ title: "No date" })
      .expect(400);
  });

  it("rejects recurrence end dates before the task due date", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;

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

  it("persists subtasks separately from task rows and returns them in snapshots", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1"));

    await request(createServer(config, db))
      .post("/api/planner/subtasks")
      .set("authorization", `Bearer ${token}`)
      .send({ taskId: "task-1", title: "Use coupon" })
      .expect(201)
      .expect((response) => {
        expect(response.body.taskId).toBe("task-1");
        expect(response.body.title).toBe("Use coupon");
        expect(response.body.completedAt).toBeNull();
      });

    await request(createServer(config, db))
      .get("/api/planner/snapshot")
      .set("authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.subtasks.map((subtask: { title: string }) => subtask.title)).toEqual(["Use coupon"]);
      });
  });

  it("appends new subtasks after the last active sibling order", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1"));
    upsertTask(db, taskFixture("task-2"));
    upsertSubtask(db, {
      id: "subtask-1",
      taskId: "task-1",
      title: "First",
      completedAt: null,
      order: 1000,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });
    upsertSubtask(db, {
      id: "subtask-2",
      taskId: "task-1",
      title: "Second",
      completedAt: null,
      order: 2000,
      createdAt: "2026-05-20T00:01:00.000Z",
      updatedAt: "2026-05-20T00:01:00.000Z",
      deletedAt: null
    });
    upsertSubtask(db, {
      id: "other-task-subtask",
      taskId: "task-2",
      title: "Other task",
      completedAt: null,
      order: 9000,
      createdAt: "2026-05-20T00:02:00.000Z",
      updatedAt: "2026-05-20T00:02:00.000Z",
      deletedAt: null
    });

    await request(createServer(config, db))
      .post("/api/planner/subtasks")
      .set("authorization", `Bearer ${token}`)
      .send({ taskId: "task-1", title: "Third" })
      .expect(201)
      .expect((response) => {
        expect(response.body.order).toBe(3000);
      });
  });

  it("requires open subtasks to be completed before completing the parent task", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1"));
    upsertSubtask(db, {
      id: "subtask-1",
      taskId: "task-1",
      title: "Use coupon",
      completedAt: null,
      order: 1000,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });

    await request(createServer(config, db))
      .post("/api/planner/tasks/task-1/complete")
      .set("authorization", `Bearer ${token}`)
      .expect(409);

    await request(createServer(config, db))
      .patch("/api/planner/subtasks/subtask-1")
      .set("authorization", `Bearer ${token}`)
      .send({ completedAt: "2026-05-20T01:00:00.000Z" })
      .expect(200);

    await request(createServer(config, db))
      .post("/api/planner/tasks/task-1/complete")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("soft-deletes subtasks when deleting the parent task", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1"));
    upsertSubtask(db, {
      id: "subtask-1",
      taskId: "task-1",
      title: "Use coupon",
      completedAt: null,
      order: 1000,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });

    await request(createServer(config, db))
      .delete("/api/planner/tasks/task-1")
      .set("authorization", `Bearer ${token}`)
      .expect(204);

    expect(listSubtasks(db).find((subtask) => subtask.id === "subtask-1")?.deletedAt).not.toBeNull();
  });

  it("clones recurring task subtasks into the next occurrence as incomplete", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1", { recurrence: { type: "daily", ends: { type: "eternity" } } }));
    upsertSubtask(db, {
      id: "subtask-1",
      taskId: "task-1",
      title: "Use coupon",
      completedAt: "2026-05-20T01:00:00.000Z",
      order: 1000,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      deletedAt: null
    });

    await request(createServer(config, db))
      .post("/api/planner/tasks/task-1/complete")
      .set("authorization", `Bearer ${token}`)
      .expect(200);

    const nextTask = listTasks(db).find((task) => task.id !== "task-1" && task.dueDate === "2026-05-21");
    expect(nextTask).toBeTruthy();
    const clonedSubtask = listSubtasks(db).find((subtask) => subtask.taskId === nextTask?.id);
    expect(clonedSubtask?.title).toBe("Use coupon");
    expect(clonedSubtask?.completedAt).toBeNull();
  });
});
