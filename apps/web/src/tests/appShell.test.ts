import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@its-personal/shared";
import AppShell from "../components/AppShell.vue";
import { usePlannerStore } from "../stores/planner.js";

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
    setActivePinia(createPinia());
    vi.clearAllMocks();
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
});
