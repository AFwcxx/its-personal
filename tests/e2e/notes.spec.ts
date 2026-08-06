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

test("long structured notes scroll with edge fades in portrait view", async ({ page }) => {
  const longNote = note({
    id: "long-checklist",
    title: "Long checklist",
    contentStyle: "checklist",
    items: Array.from({ length: 8 }, (_, index) => ({
      id: `item-${index}`,
      text: `Item ${index + 1} with enough text to wrap across several lines on a narrow note card`,
      checked: false
    }))
  });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(() => sessionStorage.clear());
  await page.route("**/api/**", async (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/unlock") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-token", idleTimeoutSeconds: 10800 }) });
    } else if (path === "/api/auth/activity") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idleTimeoutSeconds: 10800 }) });
    } else if (path === "/api/notes/snapshot") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notes: [longNote], tags: [], changeVersion: 0 }) });
    } else if (path === "/api/planner/snapshot") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: [], subtasks: [], tags: [], links: [], attachments: [], today: "2026-05-25", changeVersion: 0 }) });
    } else if (path.endsWith("/changes")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 0 }) });
    } else {
      await route.fulfill({ status: 404 });
    }
  });

  await page.goto("/notes");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }

  const region = page.locator(".note-scroll-region");
  await expect(region).toHaveClass(/is-scrollable/);
  await expect.poll(() => region.evaluate((element) => ({
    bottom: element.style.getPropertyValue("--note-scroll-bottom-edge-opacity"),
    height: element.clientHeight,
    maxHeight: window.innerHeight * 0.4,
    top: element.style.getPropertyValue("--note-scroll-top-edge-opacity")
  }))).toEqual({ bottom: "0", height: expect.any(Number), maxHeight: 409.6, top: "1" });
  const sizing = await region.evaluate((element) => ({
    clientHeight: element.clientHeight,
    computedMaxHeight: getComputedStyle(element).maxHeight,
    matchesPortraitRule: matchMedia("(max-width: 1024px) and (orientation: portrait)").matches,
    viewportLimit: window.innerHeight * 0.4
  }));
  expect(sizing.matchesPortraitRule).toBe(true);
  expect(sizing.computedMaxHeight).toBe(`${sizing.viewportLimit}px`);
  expect(sizing.clientHeight).toBeLessThanOrEqual(Math.ceil(sizing.viewportLimit));

  await region.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => region.evaluate((element) => ({
    bottom: element.style.getPropertyValue("--note-scroll-bottom-edge-opacity"),
    top: element.style.getPropertyValue("--note-scroll-top-edge-opacity")
  }))).toEqual({ bottom: "1", top: "0" });
  const savedScrollTop = await region.evaluate((element) => element.scrollTop);

  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect.poll(() => page.locator(".note-scroll-region").evaluate((element) => element.scrollTop)).toBe(savedScrollTop);
});
