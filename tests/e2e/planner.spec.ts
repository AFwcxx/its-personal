import { expect, test } from "@playwright/test";

test("unlock page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Its Personal" })).toBeVisible();
});

test("planner mobile layout fits the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("its-personal-token", "e2e-token");
    sessionStorage.setItem("its-personal-last-activity-at", String(Date.now()));
    sessionStorage.setItem("its-personal-idle-timeout-seconds", "10800");
    localStorage.setItem("its-personal-theme", "dark");
  });
  await page.route("/api/**", (route) => route.fulfill({
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
        order: 1,
        tagIds: [],
        tagId: null,
        recurrence: { type: "none" }
      }],
      tags: []
    })
  }));

  await page.goto("/planner");
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
