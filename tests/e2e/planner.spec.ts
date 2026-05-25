import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("unlock page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Its Personal" })).toBeVisible();
});

test("planner mobile layout fits the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem("its-personal-theme", "dark");
    (window as unknown as { __forceMemoryOutbox: boolean }).__forceMemoryOutbox = true;
    const originalFetch = window.fetch.bind(window);
    (window as unknown as { __offlineWrites: boolean }).__offlineWrites = false;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if ((window as unknown as { __offlineWrites: boolean }).__offlineWrites && url.includes("/api/planner/tasks") && method === "POST") {
        return Promise.reject(new TypeError("Simulated offline write"));
      }
      return originalFetch(input, init);
    };
  });
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
  await page.route("**/api/planner/snapshot", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      tasks: [{
        id: "task-1",
        title: "Reply CIMB",
        dueDate: "2026-05-22",
        completedAt: null,
        deletedAt: null,
        parentId: null,
        pinned: false,
        subtasksCollapsed: false,
        order: 1,
        tagIds: [],
        tagId: null,
        recurrence: { type: "none" }
      }],
      subtasks: [{
        id: "subtask-1",
        taskId: "task-1",
        title: "Visible subtask",
        completedAt: null,
        deletedAt: null,
        order: 1,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z"
      }],
      tags: [],
      links: [],
      attachments: [],
      today: "2026-05-25"
    })
  }));

  await page.goto("/unlock");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }
  await expect(page.getByRole("heading", { name: "Planner" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    visibleOverflowingElements: [...document.querySelectorAll("*")]
      .filter((element) => !String(element.className).includes("p-hidden-accessible"))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
      }))
  }));

  expect(overflow.documentWidth).toBe(overflow.viewportWidth);
  expect(overflow.visibleOverflowingElements).toEqual([]);
});

test("offline task create stays pending and syncs once without duplicates", async ({ page }) => {
  let serverTasks: unknown[] = [];
  let simulateOffline = true;
  let successfulCreates = 0;

  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem("its-personal-theme", "dark");
  });
  await page.route("/api/auth/unlock", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: "e2e-token", idleTimeoutSeconds: 10800 })
  }));
  await page.route("/api/auth/activity", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ idleTimeoutSeconds: 10800 })
  }));
  await page.route("**/api/planner/snapshot", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tasks: serverTasks, subtasks: [], tags: [], links: [], attachments: [], today: "2026-05-25" })
  }));
  await page.route("**/api/planner/tasks", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    if (simulateOffline) {
      await route.abort("internetdisconnected");
      return;
    }
    const body = route.request().postDataJSON();
    successfulCreates += 1;
    const task = {
      id: body.id,
      title: body.title,
      parentId: body.parentId ?? null,
      dueDate: body.dueDate,
      completedAt: null,
      pinned: false,
      subtasksCollapsed: false,
      tagId: body.tagIds?.[0] ?? null,
      tagIds: body.tagIds ?? [],
      notes: body.notes ?? "",
      recurrence: { type: "none" },
      order: 1000,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      deletedAt: null
    };
    serverTasks = [task];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(task) });
  });

  await page.goto("/unlock");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }
  await expect(page.getByRole("heading", { name: "Planner" })).toBeVisible();
  await page.getByLabel("Toggle add task form").click();
  await page.getByPlaceholder("New task").fill("Offline task");
  await page.evaluate(() => ((window as unknown as { __offlineWrites: boolean }).__offlineWrites = true));
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "Saved offline" })).toBeVisible();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("1 pending")).toBeVisible();
  await expect(page.locator(".pending-sync-icon")).toHaveCount(1);
  await expect(page.getByText("Offline task")).toBeVisible();

  await page.evaluate(() => ((window as unknown as { __offlineWrites: boolean }).__offlineWrites = false));
  simulateOffline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect.poll(() => successfulCreates).toBe(1);
  await expect(page.getByText("1 pending")).toHaveCount(0);
  await expect(page.locator(".pending-sync-icon")).toHaveCount(0);
  expect(serverTasks).toHaveLength(1);
});
