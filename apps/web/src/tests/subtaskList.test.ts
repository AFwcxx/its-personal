import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subtask } from "@its-personal/shared";
import SubtaskList from "../components/SubtaskList.vue";
import { usePlannerStore } from "../stores/planner.js";

const sortable = vi.hoisted(() => ({
  options: null as { onEnd?: (event: { oldIndex?: number; newIndex?: number }) => void } | null,
  sort: vi.fn()
}));

vi.mock("sortablejs", () => ({
  default: {
    create: vi.fn((_element, options) => {
      sortable.options = options;
      return { destroy: vi.fn(), sort: sortable.sort };
    })
  }
}));

vi.mock("../services/api.js", () => ({
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] })),
  cachedSnapshot: vi.fn(() => null),
  plannerApi: {
    deleteSubtask: vi.fn(),
    updateSubtask: vi.fn()
  }
}));

const subtask = (patch: Partial<Subtask>): Subtask => ({
  id: patch.id ?? "subtask",
  taskId: patch.taskId ?? "task",
  title: patch.title ?? "Subtask",
  completedAt: patch.completedAt ?? null,
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-21T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-21T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

async function renderWithWidths(widths: Record<string, { clientWidth: number; scrollWidth: number }>) {
  const wrapper = mount(SubtaskList, {
    props: {
      taskId: "task",
      subtasks: [
        subtask({ id: "short", title: "Short" }),
        subtask({ id: "long", title: "Long subtask title that exceeds the available row width", order: 2000 })
      ]
    },
    global: {
      stubs: {
        Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
        Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" }
      }
    },
    attachTo: document.body
  });

  for (const button of wrapper.findAll<HTMLButtonElement>(".subtask-title-toggle")) {
    const width = widths[button.text()];
    if (!width) continue;
    Object.defineProperty(button.element, "clientWidth", { configurable: true, value: width.clientWidth });
    Object.defineProperty(button.element, "scrollWidth", { configurable: true, value: width.scrollWidth });
  }

  window.dispatchEvent(new Event("resize"));
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe("SubtaskList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sortable.options = null;
    sortable.sort.mockReset();
  });

  it("expands only subtasks whose title is truncated", async () => {
    const wrapper = await renderWithWidths({
      Short: { clientWidth: 120, scrollWidth: 80 },
      "Long subtask title that exceeds the available row width": { clientWidth: 120, scrollWidth: 240 }
    });

    const shortTitle = wrapper.findAll<HTMLButtonElement>(".subtask-title-toggle").find((button) => button.text() === "Short");
    const longTitle = wrapper.findAll<HTMLButtonElement>(".subtask-title-toggle").find((button) => button.text().startsWith("Long subtask"));

    expect(shortTitle?.element.disabled).toBe(true);
    expect(longTitle?.element.disabled).toBe(false);

    await longTitle!.trigger("click");
    expect(longTitle!.classes()).toContain("subtask-title-expanded");
    expect(longTitle!.attributes("aria-expanded")).toBe("true");

    await longTitle!.trigger("click");
    expect(longTitle!.classes()).not.toContain("subtask-title-expanded");
    expect(longTitle!.attributes("aria-expanded")).toBe("false");
  });

  it("does not expand truncated subtasks while selecting the title text", async () => {
    const wrapper = await renderWithWidths({
      Short: { clientWidth: 120, scrollWidth: 80 },
      "Long subtask title that exceeds the available row width": { clientWidth: 120, scrollWidth: 240 }
    });

    const longTitle = wrapper.findAll<HTMLButtonElement>(".subtask-title-toggle").find((button) => button.text().startsWith("Long subtask"));

    await longTitle!.trigger("pointerdown", { clientX: 10, clientY: 10 });
    await longTitle!.trigger("click", { clientX: 40, clientY: 10 });

    expect(longTitle!.classes()).not.toContain("subtask-title-expanded");
    expect(longTitle!.attributes("aria-expanded")).toBe("false");
  });

  it("reorders subtasks from the DOM order after Sortable moves rows", async () => {
    const planner = usePlannerStore();
    planner.reorderSubtasks = vi.fn();
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: [
          subtask({ id: "first", title: "First", order: 1000 }),
          subtask({ id: "second", title: "Second", order: 2000 }),
          subtask({ id: "third", title: "Third", order: 3000 })
        ]
      },
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" }
        }
      }
    });
    await wrapper.vm.$nextTick();

    const list = wrapper.find<HTMLElement>(".subtask-list").element;
    const rows = wrapper.findAll<HTMLElement>(".subtask-row");
    list.append(rows[0]!.element);

    sortable.options?.onEnd?.({ oldIndex: 0, newIndex: 2 });

    expect(planner.reorderSubtasks).toHaveBeenCalledWith([
      expect.objectContaining({ id: "second" }),
      expect.objectContaining({ id: "third" }),
      expect.objectContaining({ id: "first" })
    ]);
    expect(sortable.sort).toHaveBeenLastCalledWith(["second", "third", "first"]);
  });
});
