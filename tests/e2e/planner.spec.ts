import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("unlock page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Its Personal" })).toBeVisible();
});

test("planner mobile layout fits the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
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

test("task detail backdrop covers the full left side and closes the menu", async ({ page }) => {
  await page.setViewportSize({ width: 1792, height: 1536 });
  await page.addInitScript(() => {
    sessionStorage.clear();
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
        title: "Its personal",
        dueDate: "2026-05-25",
        completedAt: null,
        deletedAt: null,
        parentId: null,
        pinned: false,
        subtasksCollapsed: false,
        order: 1,
        tagIds: [],
        tagId: null,
        notes: "",
        recurrence: { type: "none" },
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }],
      subtasks: [],
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
  const mainBeforeOpen = await page.locator(".main").boundingBox();
  await page.locator(".task-row").first().click();

  const backdrop = page.locator(".detail-backdrop");
  await expect(backdrop).toBeVisible();
  await expect(page.locator(".detail")).toBeVisible();

  const coverage = await page.evaluate(() => ({
    backdropAtBottomLeft: document.elementFromPoint(30, window.innerHeight - 30)?.className,
    panelAtRight: document.elementFromPoint(window.innerWidth - 80, 80)?.className
  }));

  const mainAfterOpen = await page.locator(".main").boundingBox();

  expect(mainAfterOpen?.x).toBe(mainBeforeOpen?.x);
  expect(mainAfterOpen?.width).toBe(mainBeforeOpen?.width);
  expect(coverage.backdropAtBottomLeft).toContain("detail-backdrop");
  expect(coverage.panelAtRight).toContain("detail");

  await page.mouse.click(30, 30);

  await expect(backdrop).toHaveCount(0);
  await expect(page.locator(".detail")).toHaveCount(0);
});

test("subtask order stays after reordering then toggling completion", async ({ page }) => {
  const serverSubtasks = [
    {
      id: "subtask-first",
      taskId: "task-1",
      title: "First subtask",
      completedAt: null,
      deletedAt: null,
      order: 1000,
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    },
    {
      id: "subtask-second",
      taskId: "task-1",
      title: "Second subtask",
      completedAt: null,
      deletedAt: null,
      order: 2000,
      createdAt: "2026-05-25T00:01:00.000Z",
      updatedAt: "2026-05-25T00:01:00.000Z"
    },
    {
      id: "subtask-third",
      taskId: "task-1",
      title: "Third subtask",
      completedAt: null,
      deletedAt: null,
      order: 3000,
      createdAt: "2026-05-25T00:02:00.000Z",
      updatedAt: "2026-05-25T00:02:00.000Z"
    }
  ];

  await page.addInitScript(() => {
    sessionStorage.clear();
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
        title: "Task with subtasks",
        dueDate: "2026-05-25",
        completedAt: null,
        deletedAt: null,
        parentId: null,
        pinned: false,
        subtasksCollapsed: false,
        order: 1000,
        tagIds: [],
        tagId: null,
        notes: "",
        recurrence: { type: "none" },
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z"
      }],
      subtasks: serverSubtasks,
      tags: [],
      links: [],
      attachments: [],
      today: "2026-05-25"
    })
  }));
  await page.route("**/api/planner/subtasks/*", (route) => {
    const id = route.request().url().split("/").pop();
    const body = route.request().postDataJSON();
    const current = serverSubtasks.find((subtask) => subtask.id === id)!;
    if (body.order !== undefined) current.order = body.order;
    if (body.completedAt !== undefined) current.completedAt = body.completedAt;
    const response = body.completedAt !== undefined
      ? { ...current, order: id === "subtask-third" ? 3000 : current.order }
      : current;
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });

  await page.goto("/unlock");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
  }
  await expect(page.getByRole("heading", { name: "Planner" })).toBeVisible();

  const titles = page.locator(".subtask-title");
  await expect(titles).toHaveText(["First subtask", "Second subtask", "Third subtask"]);

  const firstHandle = page.locator(".subtask-row").filter({ hasText: "First subtask" }).locator(".subtask-drag-handle");
  const thirdRow = page.locator(".subtask-row").filter({ hasText: "Third subtask" });
  await firstHandle.dragTo(thirdRow);
  await expect(titles).toHaveText(["Second subtask", "Third subtask", "First subtask"]);

  await page.locator(".subtask-row").filter({ hasText: "Third subtask" }).getByRole("button", { name: "Complete" }).click();

  await expect(titles).toHaveText(["Second subtask", "Third subtask", "First subtask"]);
});

test("offline task create stays pending and syncs once without duplicates", async ({ page }) => {
  let serverTasks: unknown[] = [];
  let simulateOffline = true;
  let successfulCreates = 0;

  await page.addInitScript(() => {
    sessionStorage.clear();
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
