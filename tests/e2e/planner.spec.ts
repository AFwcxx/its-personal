import { expect, test } from "@playwright/test";

test("unlock page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Its Personal" })).toBeVisible();
});
