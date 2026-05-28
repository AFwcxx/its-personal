import { expect, test } from "@playwright/test";
import type { Note } from "@its-personal/shared";

test.use({ serviceWorkers: "block" });

const note = (patch: Partial<Note>): Note => ({
  id: patch.id ?? "note",
  title: patch.title ?? "Note",
  content: patch.content ?? "Content",
  contentStyle: patch.contentStyle ?? "normal",
  items: patch.items ?? [],
  pinned: patch.pinned ?? false,
  tagIds: patch.tagIds ?? [],
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-25T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-25T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

test("note order persists after visual drag and refresh", async ({ page }) => {
  const serverNotes = [
    note({ id: "first", title: "First", pinned: true, order: 1000 }),
    note({ id: "second", title: "Second", pinned: true, order: 2000 }),
    note({ id: "third", title: "Third", pinned: true, order: 3000 })
  ];
  const patches: Array<{ id: string | undefined; patch: Partial<Note> }> = [];

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.addInitScript(() => sessionStorage.clear());
  await page.route("**/api/auth/unlock", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: "e2e-token", idleTimeoutSeconds: 10800 })
  }));
  await page.route("**/api/auth/activity", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ idleTimeoutSeconds: 10800 })
  }));
  await page.route("**/api/notes/changes", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 0 })
  }));
  await page.route("**/api/planner/snapshot", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tasks: [], subtasks: [], tags: [], links: [], attachments: [], today: "2026-05-25", changeVersion: 0 })
  }));
  await page.route("**/api/notes/snapshot", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ notes: serverNotes, tags: [], changeVersion: 0 })
  }));
  await page.route("**/api/notes/*", async (route, request) => {
    if (request.method() !== "PATCH") {
      await route.fallback();
      return;
    }
    const id = request.url().split("/").pop();
    const patch = request.postDataJSON() as Partial<Note>;
    patches.push({ id, patch });
    const index = serverNotes.findIndex((candidate) => candidate.id === id);
    serverNotes[index] = { ...serverNotes[index]!, ...patch };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(serverNotes[index])
    });
  });

  await page.goto("/notes");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }
  await expect(page.getByRole("heading", { name: "Pinned" })).toBeVisible();

  await page.locator(".note-card", { hasText: "First" }).locator(".note-drag-handle").dragTo(page.locator(".note-card", { hasText: "Third" }));
  await expect.poll(() => patches).toHaveLength(3);
  await expect.poll(() => serverNotes.slice().sort((a, b) => a.order - b.order).map((candidate) => candidate.id)).toEqual(["second", "third", "first"]);
  await expect.poll(async () => page.locator(".note-card").evaluateAll((cards) => cards.map((card) => ({
    className: card.className,
    opacity: window.getComputedStyle(card).opacity
  })))).toEqual([
    { className: "note-card", opacity: "1" },
    { className: "note-card", opacity: "1" },
    { className: "note-card", opacity: "1" }
  ]);

  await page.reload();
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }

  await expect.poll(async () => page.locator(".note-card").evaluateAll((cards) => cards.map((card) => card.textContent ?? ""))).toEqual([
    expect.stringContaining("Second"),
    expect.stringContaining("Third"),
    expect.stringContaining("First")
  ]);
});
