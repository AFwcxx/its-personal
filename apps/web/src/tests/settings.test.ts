import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MainNavigationView from "../views/MainNavigationView.vue";
import SettingsView from "../views/SettingsView.vue";
import { useSettingsStore } from "../stores/settings.js";

const { loadMainNavigation, saveMainNavigation, sortableCreate } = vi.hoisted(() => ({
  loadMainNavigation: vi.fn(),
  saveMainNavigation: vi.fn(),
  sortableCreate: vi.fn(() => ({ destroy: vi.fn() }))
}));
const beforeRouteLeave = vi.hoisted(() => vi.fn());

vi.mock("../services/api.js", () => ({ settingsApi: { loadMainNavigation, saveMainNavigation } }));
vi.mock("sortablejs", () => ({ default: { create: sortableCreate } }));
vi.mock("vue-router", () => ({
  RouterLink: { props: ["to", "custom"], template: "<slot :navigate=\"() => {}\" :is-active=\"to === '/settings/tags'\" />" },
  RouterView: { template: "<div />" },
  onBeforeRouteLeave: beforeRouteLeave,
  useRouter: () => ({ push: vi.fn() })
}));

const global = {
  stubs: {
    AppShell: { template: "<main><slot /></main>" },
    Button: { props: ["label", "disabled"], template: "<button v-bind='$attrs' :disabled='disabled' @click='$emit(\"click\")'>{{ label }}</button>" },
    Dialog: { props: ["visible"], template: "<div v-if='visible'><slot /></div>" },
    Message: { template: "<p><slot /></p>" }
  }
};

describe("Settings navigation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    loadMainNavigation.mockReset();
    saveMainNavigation.mockReset();
    sortableCreate.mockClear();
    beforeRouteLeave.mockClear();
  });

  it("does not mount Sortable while loading, then mounts after a successful load", async () => {
    let resolveLoad: ((value: { orderedIds: string[] }) => void) | undefined;
    loadMainNavigation.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));
    const wrapper = mount(MainNavigationView, { global });

    expect(sortableCreate).not.toHaveBeenCalled();
    resolveLoad?.({ orderedIds: ["planner", "notes", "schedule", "tracker", "all", "archive", "settings"] });
    await flushPromises();
    expect(sortableCreate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("keeps failed loads one-shot until the explicit retry", async () => {
    loadMainNavigation.mockRejectedValue(new Error("offline"));
    const settings = useSettingsStore();

    await settings.load();
    await settings.load();
    expect(loadMainNavigation).toHaveBeenCalledTimes(1);

    loadMainNavigation.mockResolvedValue({ orderedIds: ["settings", "planner", "notes", "schedule", "tracker", "all", "archive"] });
    await settings.load(true);
    expect(loadMainNavigation).toHaveBeenCalledTimes(2);
    expect(settings.mainNavigationOrder[0]).toBe("settings");
  });

  it("renders Tags and Main Navi as Settings pills", () => {
    const wrapper = mount(SettingsView, { global });

    expect(wrapper.text()).toContain("Tags");
    expect(wrapper.text()).toContain("Main Navi");
  });

  it("keeps a reorder as a draft until Save succeeds", async () => {
    const settings = useSettingsStore();
    settings.loadState = "loaded";
    saveMainNavigation.mockResolvedValue({ orderedIds: ["notes", "planner", "schedule", "tracker", "all", "archive", "settings"] });
    const wrapper = mount(MainNavigationView, { global });

    (wrapper.vm as unknown as { move: (index: number, amount: -1 | 1) => void }).move(0, 1);
    expect(settings.mainNavigationOrder[0]).toBe("planner");
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    await flushPromises();

    expect(saveMainNavigation).toHaveBeenCalledWith(["notes", "planner", "schedule", "tracker", "all", "archive", "settings"]);
    expect(settings.mainNavigationOrder[0]).toBe("notes");
  });

  it("keeps the draft and reports a failed save", async () => {
    const settings = useSettingsStore();
    settings.loadState = "loaded";
    saveMainNavigation.mockRejectedValue(new Error("offline"));
    const wrapper = mount(MainNavigationView, { global });

    (wrapper.vm as unknown as { move: (index: number, amount: -1 | 1) => void }).move(0, 1);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    await flushPromises();

    expect(wrapper.text()).toContain("Could not save navigation order");
    expect(settings.mainNavigationOrder[0]).toBe("planner");
  });

  it("opens the app dialog when leaving a dirty draft", async () => {
    const settings = useSettingsStore();
    settings.loadState = "loaded";
    const wrapper = mount(MainNavigationView, { global });
    (wrapper.vm as unknown as { move: (index: number, amount: -1 | 1) => void }).move(0, 1);

    const guard = beforeRouteLeave.mock.calls[0]?.[0] as (() => Promise<boolean>) | undefined;
    if (!guard) throw new Error("Expected a route leave guard");
    const leaving = guard();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Your unsaved navigation order will be lost.");
    await wrapper.findAll("button").find((button) => button.text() === "Discard")?.trigger("click");
    await expect(leaving).resolves.toBe(true);
  });
});
