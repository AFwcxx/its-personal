import { describe, expect, it } from "vitest";
import request from "supertest";
import { issueSession, verifyPassword, verifySession } from "../src/auth/session.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/connection.js";
import { listNotes, listSubtasks, listTasks, upsertSubtask, upsertTask } from "../src/db/repositories.js";
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
    subtasksCollapsed: false,
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

  it("exposes dark theme colors in the web app manifest", async () => {
    const db = openDatabase(":memory:");

    await request(createServer(config, db))
      .get("/manifest.webmanifest")
      .expect(200)
      .expect((response) => {
        expect(response.body.theme_color).toBe("#070710");
        expect(response.body.background_color).toBe("#070710");
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
      subtasksCollapsed: false,
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

  it("defaults task subtask lists to expanded and persists collapse state", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;

    await request(createServer(config, db))
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ title: "Parent", dueDate: "2026-05-20" })
      .expect(201)
      .expect((response) => {
        expect(response.body.subtasksCollapsed).toBe(false);
      });

    const taskId = listTasks(db)[0]?.id;
    await request(createServer(config, db))
      .patch(`/api/planner/tasks/${taskId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ subtasksCollapsed: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.subtasksCollapsed).toBe(true);
      });

    expect(listTasks(db)[0]?.subtasksCollapsed).toBe(true);
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
      subtasksCollapsed: false,
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

  it("replays task create operation IDs without duplicating submitted tasks", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    const server = createServer(config, db);
    const body = {
      id: "task-client-1",
      operationId: "op-create-task-1",
      title: "Queued task",
      dueDate: "2026-05-20"
    };

    const first = await request(server)
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send(body)
      .expect(201);

    const second = await request(server)
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ ...body, title: "Different replay title" })
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(listTasks(db).filter((task) => task.id === "task-client-1")).toHaveLength(1);
    expect(listTasks(db).find((task) => task.id === "task-client-1")?.title).toBe("Queued task");
  });

  it("replays task update operation IDs with the original response", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    const server = createServer(config, db);
    upsertTask(db, taskFixture("task-1"));

    const first = await request(server)
      .patch("/api/planner/tasks/task-1")
      .set("authorization", `Bearer ${token}`)
      .send({ operationId: "op-update-task-1", title: "First update" })
      .expect(200);

    const second = await request(server)
      .patch("/api/planner/tasks/task-1")
      .set("authorization", `Bearer ${token}`)
      .send({ operationId: "op-update-task-1", title: "Replay update" })
      .expect(200);

    expect(second.body).toEqual(first.body);
    expect(listTasks(db).find((task) => task.id === "task-1")?.title).toBe("First update");
  });

  it("persists notes through the separate notes API", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    const server = createServer(config, db);
    const noteBody = {
      id: "note-client-1",
      operationId: "op-create-note-1",
      title: "",
      content: "Buy milk\nUse coupon",
      contentStyle: "checklist",
      items: [
        { id: "item-1", text: "Buy milk", checked: false },
        { id: "item-2", text: "Use coupon", checked: true }
      ],
      pinned: true,
      tagIds: []
    };

    const created = await request(server)
      .post("/api/notes")
      .set("authorization", `Bearer ${token}`)
      .send(noteBody)
      .expect(201);

    await request(server)
      .post("/api/notes")
      .set("authorization", `Bearer ${token}`)
      .send({ ...noteBody, title: "Replay title" })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual(created.body);
      });

    await request(server)
      .patch("/api/notes/note-client-1")
      .set("authorization", `Bearer ${token}`)
      .send({ operationId: "op-update-note-1", pinned: false, items: [{ id: "item-1", text: "Buy milk", checked: true }] })
      .expect(200)
      .expect((response) => {
        expect(response.body.pinned).toBe(false);
        expect(response.body.items[0].checked).toBe(true);
      });

    await request(server)
      .get("/api/notes/snapshot")
      .set("authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.notes).toHaveLength(1);
        expect(response.body.changeVersion).toBe(2);
      });

    await request(server)
      .delete("/api/notes/note-client-1")
      .set("authorization", `Bearer ${token}`)
      .send({ operationId: "op-delete-note-1" })
      .expect(204);

    expect(listNotes(db).find((note) => note.id === "note-client-1")?.deletedAt).not.toBeNull();
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

  it("increments the planner change version after planner mutations", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    const server = createServer(config, db);

    await request(server)
      .get("/api/planner/changes")
      .set("authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.version).toBe(0);
      });

    await request(server)
      .post("/api/planner/tasks")
      .set("authorization", `Bearer ${token}`)
      .send({ title: "Live task", dueDate: "2026-05-20" })
      .expect(201);

    await request(server)
      .get("/api/planner/snapshot")
      .set("authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.changeVersion).toBe(1);
        expect(response.body.tasks.map((task: { title: string }) => task.title)).toEqual(["Live task"]);
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

  it("reorders active sibling subtasks in one list-level operation", async () => {
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
      order: 1000,
      createdAt: "2026-05-20T00:02:00.000Z",
      updatedAt: "2026-05-20T00:02:00.000Z",
      deletedAt: null
    });

    await request(createServer(config, db))
      .patch("/api/planner/tasks/task-1/subtasks/order")
      .set("authorization", `Bearer ${token}`)
      .send({ orderedIds: ["subtask-2", "subtask-1"] })
      .expect(200)
      .expect((response) => {
        expect(response.body.map((subtask: { id: string; order: number }) => [subtask.id, subtask.order])).toEqual([["subtask-2", 1000], ["subtask-1", 2000]]);
      });

    expect(listSubtasks(db).filter((subtask) => subtask.taskId === "task-1").map((subtask) => subtask.id)).toEqual(["subtask-2", "subtask-1"]);
    expect(listSubtasks(db).find((subtask) => subtask.id === "other-task-subtask")?.order).toBe(1000);
  });

  it("rejects subtask reorders that omit active siblings", async () => {
    const db = openDatabase(":memory:");
    const token = issueSession(config, db, "test-device").token;
    upsertTask(db, taskFixture("task-1"));
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

    await request(createServer(config, db))
      .patch("/api/planner/tasks/task-1/subtasks/order")
      .set("authorization", `Bearer ${token}`)
      .send({ orderedIds: ["subtask-2"] })
      .expect(400);
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
    upsertTask(db, taskFixture("task-1", { subtasksCollapsed: true, recurrence: { type: "daily", ends: { type: "eternity" } } }));
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
    expect(nextTask?.subtasksCollapsed).toBe(false);
    const clonedSubtask = listSubtasks(db).find((subtask) => subtask.taskId === nextTask?.id);
    expect(clonedSubtask?.title).toBe("Use coupon");
    expect(clonedSubtask?.completedAt).toBeNull();
  });
});
