import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrackerView from "../views/TrackerView.vue";
import { usePlannerStore } from "../stores/planner.js";

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [], trackers: [], trackerMarks: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {}
}));

function mountTracker() {
  return mount(TrackerView, {
    global: { stubs: {
      AppShell: { template: "<main><slot /></main>" },
      Button: { inheritAttrs: false, props: ["label", "disabled"], emits: ["click"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'>{{ label }}<slot /></button>" },
      Card: { template: "<section><slot name='content' /></section>" },
      Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
      InputText: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value='modelValue' v-bind='$attrs' @input='$emit(\"update:modelValue\", $event.target.value)' @keydown='$emit(\"keydown\", $event)' />" }
    } }
  });
}

describe("TrackerView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("shows active rows, toggles magenta marks, and highlights today", async () => {
    const planner = usePlannerStore();
    planner.currentDate = "2026-05-21";
    planner.trackers = [
      { id: "active", name: "Exercise", activeFromMonth: "2026-05", retiredFromMonth: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
      { id: "future", name: "Read", activeFromMonth: "2026-06", retiredFromMonth: null, createdAt: "2026-05-02T00:00:00.000Z", updatedAt: "2026-05-02T00:00:00.000Z" }
    ];
    planner.trackerMarks = [{ trackerId: "active", date: "2026-05-21", completedAt: "2026-05-21T00:00:00.000Z", updatedAt: "2026-05-21T00:00:00.000Z" }];
    planner.refresh = vi.fn();
    planner.setTrackerMark = vi.fn();

    const wrapper = mountTracker();
    await Promise.resolve();

    expect(wrapper.text()).toContain("Exercise");
    expect(wrapper.text()).not.toContain("Read");
    const today = wrapper.find("button[aria-label='Exercise, 2026-05-21']");
    expect(today.text()).toBe("x");
    expect(today.element.closest("td")?.classList.contains("tracker-today")).toBe(true);
    await today.trigger("click");
    expect(planner.setTrackerMark).toHaveBeenCalledWith("active", "2026-05-21", false);
  });

  it("creates a tracker in the displayed month", async () => {
    const planner = usePlannerStore();
    planner.currentDate = "2026-05-21";
    planner.refresh = vi.fn();
    planner.createTracker = vi.fn();
    const wrapper = mountTracker();
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "Prev")!.trigger("click");
    await wrapper.find("[aria-label='Toggle add tracker form']").trigger("click");
    await wrapper.find("input[placeholder='New tracker']").setValue("Read");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");

    expect(planner.createTracker).toHaveBeenCalledWith("Read", "2026-04");
  });
});
