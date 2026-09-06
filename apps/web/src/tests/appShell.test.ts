import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import AppShell from "../components/AppShell.vue";
import { usePlannerStore } from "../stores/planner.js";
import { useSettingsStore } from "../stores/settings.js";

vi.mock("virtual:pwa-register", () => ({
  registerSW: vi.fn(() => vi.fn())
}));

vi.mock("vue-router", () => ({
  RouterLink: {
    props: ["to", "custom"],
    template: "<slot :navigate='() => {}' :is-active='false' />"
  },
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {}
}));

const task = (patch: Partial<Task> = {}): Task => ({
  id: patch.id ?? "task",
  title: patch.title ?? "Task",
  parentId: patch.parentId ?? null,
  dueDate: patch.dueDate ?? "2026-05-21",
  recurrenceDate: patch.recurrenceDate ?? null,
  completedAt: patch.completedAt ?? null,
  pinned: patch.pinned ?? false,
  subtasksCollapsed: patch.subtasksCollapsed ?? false,
  tagId: patch.tagId ?? null,
  tagIds: patch.tagIds ?? [],
  notes: patch.notes ?? "",
  recurrence: patch.recurrence ?? { type: "none" },
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-21T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-21T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

describe("AppShell task detail backdrop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the task detail menu when the frosted backdrop is clicked", async () => {
    const planner = usePlannerStore();
    planner.tasks = [task({ id: "open-task" })];
    planner.selectedTaskId = "open-task";
    planner.refreshPendingStatus = vi.fn();
    planner.refreshIfChanged = vi.fn();

    const wrapper = mount(AppShell, {
      global: {
        stubs: {
          Button: { props: ["label", "icon"], template: "<button type='button' @click='$emit(\"click\")'>{{ label }}<slot /></button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          SubtaskCreateDialog: true,
          TaskDetailPanel: { template: "<aside class='detail'>Task detail</aside>" }
        }
      }
    });

    const backdrop = wrapper.find(".detail-backdrop");
    expect(backdrop.exists()).toBe(true);
    expect(backdrop.attributes("aria-label")).toBe("Close task menu");

    await backdrop.trigger("click");

    expect(planner.selectedTaskId).toBeNull();
  });

  it("refreshes the planner date from the clock while the app stays open", async () => {
    const planner = usePlannerStore();
    planner.refreshPendingStatus = vi.fn();
    planner.refreshIfChanged = vi.fn();
    planner.refreshCurrentDate = vi.fn();

    mount(AppShell, {
      global: {
        stubs: {
          Button: { props: ["label", "icon"], template: "<button type='button' @click='$emit(\"click\")'>{{ label }}<slot /></button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          SubtaskCreateDialog: true,
          TaskDetailPanel: true
        }
      }
    });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(planner.refreshCurrentDate).toHaveBeenCalledTimes(1);
  });

  it("uses one configured order for desktop and mobile navigation", async () => {
    const planner = usePlannerStore();
    planner.refreshPendingStatus = vi.fn();
    planner.refreshIfChanged = vi.fn();
    const settings = useSettingsStore();
    settings.loadState = "loaded";
    settings.mainNavigationOrder = ["settings", "planner", "notes", "schedule", "tracker", "all", "archive"];

    const wrapper = mount(AppShell, {
      global: {
        stubs: {
          Button: { props: ["label", "icon"], template: "<button type='button' @click='$emit(\"click\")'>{{ label }}<slot /></button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          SubtaskCreateDialog: true,
          TaskDetailPanel: true
        }
      }
    });

    const labels = (selector: string) => wrapper.find(selector).findAll("button").map((button) => button.text());
    expect(labels(".desktop-nav")).toEqual(["Settings", "Planner", "Notes", "Schedule", "Tracker", "All Tasks", "Archive"]);

    await wrapper.find(".mobile-nav-button").trigger("click");
    expect(labels(".mobile-nav")).toEqual(["Settings", "Planner", "Notes", "Schedule", "Tracker", "All Tasks", "Archive"]);
  });
});
