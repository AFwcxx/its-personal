import { describe, it } from "vitest";
import request from "supertest";
import { issueSession } from "../src/auth/session.js";
import { openDatabase } from "../src/db/connection.js";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  APP_PASSWORD: "secret",
  SESSION_SECRET: "test-secret-with-enough-length",
  DATABASE_PATH: ":memory:",
  ATTACHMENT_DIR: "./attachments-test",
  MAX_ATTACHMENT_BYTES: "1000000",
  MAX_TOTAL_ATTACHMENT_BYTES: "1000000"
});

describe("settings navigation API", () => {
  it("requires an authenticated session", async () => {
    const server = createServer(config, openDatabase(":memory:"));

    await request(server).get("/api/settings/main-navigation").expect(401);
    await request(server).put("/api/settings/main-navigation").send({ orderedIds: [] }).expect(401);
  });

  it("returns and persists the shared default navigation order", async () => {
    const db = openDatabase(":memory:");
    const server = createServer(config, db);
    const token = issueSession(config, db, "settings-device").token;
    const auth = { authorization: `Bearer ${token}` };
    const defaultOrder = ["planner", "notes", "schedule", "tracker", "all", "archive", "settings"];

    await request(server).get("/api/settings/main-navigation").set(auth).expect(200).expect({ orderedIds: defaultOrder });
    const saved = ["settings", "planner", "notes", "schedule", "tracker", "all", "archive"];
    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: saved }).expect(200).expect({ orderedIds: saved });
    await request(server).get("/api/settings/main-navigation").set(auth).expect(200).expect({ orderedIds: saved });
  });

  it("rejects incomplete or duplicate orders at the trust boundary", async () => {
    const db = openDatabase(":memory:");
    const server = createServer(config, db);
    const token = issueSession(config, db, "settings-device").token;
    const auth = { authorization: `Bearer ${token}` };

    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: ["planner"] }).expect(400);
    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: ["planner", "planner", "schedule", "tracker", "all", "archive", "settings"] }).expect(400);
    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: ["planner", "notes", "schedule", "tracker", "all", "archive", "unknown"] }).expect(400);
  });

  it("uses the latest complete save", async () => {
    const db = openDatabase(":memory:");
    const server = createServer(config, db);
    const token = issueSession(config, db, "settings-device").token;
    const auth = { authorization: `Bearer ${token}` };
    const first = ["settings", "planner", "notes", "schedule", "tracker", "all", "archive"];
    const latest = ["notes", "planner", "schedule", "tracker", "all", "archive", "settings"];

    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: first }).expect(200);
    await request(server).put("/api/settings/main-navigation").set(auth).send({ orderedIds: latest }).expect(200);
    await request(server).get("/api/settings/main-navigation").set(auth).expect(200).expect({ orderedIds: latest });
  });

  it("falls back when a stored setting is malformed", async () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO app_settings (key, value_json) VALUES (?, ?)").run("main-navigation-order", "not-json");
    const server = createServer(config, db);
    const token = issueSession(config, db, "settings-device").token;

    await request(server).get("/api/settings/main-navigation").set("authorization", `Bearer ${token}`).expect(200).expect({
      orderedIds: ["planner", "notes", "schedule", "tracker", "all", "archive", "settings"]
    });
  });
});
