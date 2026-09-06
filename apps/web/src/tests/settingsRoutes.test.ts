import { describe, expect, it } from "vitest";
import { router } from "../router.js";
import ManageTagsView from "../views/ManageTagsView.vue";

describe("Settings routes", () => {
  it("exposes both Settings pages and preserves the old Tags link", () => {
    const paths = router.getRoutes().map((route) => route.path);

    expect(paths).toContain("/settings/tags");
    expect(paths).toContain("/settings/main-navi");
    expect(router.getRoutes().find((route) => route.path === "/tags")?.redirect).toBe("/settings/tags");
    expect(router.getRoutes().find((route) => route.path === "/settings/tags")?.components?.default).toBe(ManageTagsView);
  });
});
