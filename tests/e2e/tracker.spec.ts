import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("tracker table scrolls without moving its row labels", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear());
  await page.route("**/api/**", async (route, request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/unlock") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-token", idleTimeoutSeconds: 10800 }) });
    } else if (path === "/api/auth/activity") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idleTimeoutSeconds: 10800 }) });
    } else if (path === "/api/config") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ appTitle: "Its Personal", authMode: "password" }) });
    } else if (path === "/api/planner/snapshot") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tasks: [], subtasks: [], tags: [], links: [], attachments: [],
          trackers: [{ id: "exercise", name: "Exercise", activeFromMonth: "2026-05", retiredFromMonth: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" }],
          trackerMarks: [{ trackerId: "exercise", date: "2026-05-21", completedAt: "2026-05-21T00:00:00.000Z", updatedAt: "2026-05-21T00:00:00.000Z" }],
          today: "2026-05-21",
          changeVersion: 0
        })
      });
    } else if (path.endsWith("/changes")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 0 }) });
    } else {
      await route.fulfill({ status: 404 });
    }
  });

  await page.goto("/tracker");
  if (await page.getByPlaceholder("Password").isVisible()) {
    await page.getByPlaceholder("Password").fill("secret");
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.getByRole("button", { name: "Tracker", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Tracker" })).toBeVisible();

  for (const viewport of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const result = await page.locator(".tracker-table-scroll").evaluate((scroll) => {
      const label = scroll.querySelector<HTMLElement>("tbody .tracker-label-cell")!;
      const before = label.getBoundingClientRect().left;
      scroll.scrollLeft = scroll.scrollWidth;
      const after = label.getBoundingClientRect().left;
      return { before, after, scrollable: scroll.scrollWidth > scroll.clientWidth, overflowY: getComputedStyle(scroll).overflowY, documentFits: document.documentElement.scrollWidth === document.documentElement.clientWidth };
    });
    expect(result.scrollable).toBe(true);
    expect(result.overflowY).toBe("hidden");
    expect(result.documentFits).toBe(true);
    expect(Math.abs(result.after - result.before)).toBeLessThan(1);
  }
});
