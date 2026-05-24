import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subtask } from "@its-personal/shared";
import SubtaskList from "../components/SubtaskList.vue";
import { plannerApi } from "../services/api.js";
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
    deleteSubtask: vi.fn(async () => undefined),
    updateSubtask: vi.fn(async (id: string, patch: Partial<Subtask>) => subtask({ id, ...patch }))
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

describe("SubtaskList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    sortable.options = null;
    sortable.sort.mockReset();
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

  it("updates an incomplete subtask from the edit dialog and closes it", async () => {
    const planner = usePlannerStore();
    planner.subtasks = [subtask({ id: "first", title: "First" })];
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: planner.subtasks
      },
      global: {
        stubs: {
          Button: { props: ["label", "disabled"], emits: ["click"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue", "placeholder"], emits: ["update:modelValue"], template: "<textarea :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" }
        }
      }
    });

    await wrapper.find(".subtask-row").trigger("click");
    await wrapper.find("textarea[placeholder='Subtask']").setValue("  Updated  ");
    const updateButton = wrapper.findAll("button").find((button) => button.text() === "Update");
    await updateButton!.trigger("click");
    await flushPromises();

    expect(plannerApi.updateSubtask).toHaveBeenCalledWith("first", { title: "Updated" });
    expect(wrapper.find("textarea[placeholder='Subtask']").exists()).toBe(false);
  });

  it("blocks empty subtask title updates", async () => {
    const planner = usePlannerStore();
    planner.subtasks = [subtask({ id: "first", title: "First" })];
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: planner.subtasks
      },
      global: {
        stubs: {
          Button: { props: ["label", "disabled"], emits: ["click"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue", "placeholder"], emits: ["update:modelValue"], template: "<textarea :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" }
        }
      }
    });

    await wrapper.find(".subtask-row").trigger("click");
    await wrapper.find("textarea[placeholder='Subtask']").setValue("   ");
    const updateButton = wrapper.findAll("button").find((button) => button.text() === "Update");

    expect(updateButton?.element.disabled).toBe(true);

    await updateButton!.trigger("click");
    await flushPromises();

    expect(plannerApi.updateSubtask).not.toHaveBeenCalled();
  });

  it("does not open the edit dialog for completed subtasks", async () => {
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: [subtask({ id: "done", title: "Done", completedAt: "2026-05-21T01:00:00.000Z" })]
      },
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    await wrapper.find(".subtask-row").trigger("click");

    expect(wrapper.find("textarea[placeholder='Subtask']").exists()).toBe(false);
    expect(wrapper.find("button[aria-label='Complete']").exists()).toBe(true);
  });

  it("shows an inline delete action only for completed subtasks and confirms before deleting", async () => {
    const planner = usePlannerStore();
    planner.subtasks = [
      subtask({ id: "open", title: "Open" }),
      subtask({ id: "done", title: "Done", completedAt: "2026-05-21T01:00:00.000Z" })
    ];
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: planner.subtasks
      },
      global: {
        stubs: {
          Button: { props: ["label"], emits: ["click"], template: "<button type='button' @click='$emit(\"click\", $event)'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue"], template: "<textarea :value='modelValue' />" }
        }
      }
    });

    const rows = wrapper.findAll(".subtask-row");
    expect(rows[0]!.find("button[aria-label='Delete subtask']").exists()).toBe(false);
    expect(rows[1]!.find("button[aria-label='Delete subtask']").exists()).toBe(true);

    await rows[1]!.find("button[aria-label='Delete subtask']").trigger("click");

    expect(plannerApi.deleteSubtask).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Delete "Done"?');

    await wrapper.findAll("button").find((button) => button.text() === "Confirm")!.trigger("click");
    await flushPromises();

    expect(plannerApi.deleteSubtask).toHaveBeenCalledWith("done");
  });

  it("asks for confirmation before deleting from the edit dialog", async () => {
    const planner = usePlannerStore();
    planner.subtasks = [subtask({ id: "first", title: "First" })];
    const wrapper = mount(SubtaskList, {
      props: {
        taskId: "task",
        subtasks: planner.subtasks
      },
      global: {
        stubs: {
          Button: { props: ["label", "disabled"], emits: ["click"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'><slot />{{ label }}</button>" },
          Dialog: { props: ["visible"], template: "<section v-if='visible'><slot /></section>" },
          Textarea: { props: ["modelValue", "placeholder"], emits: ["update:modelValue"], template: "<textarea :placeholder='placeholder' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" }
        }
      }
    });

    await wrapper.find(".subtask-row").trigger("click");
    await wrapper.find("button[aria-label='Delete']").trigger("click");

    expect(plannerApi.deleteSubtask).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Delete "First"?');

    await wrapper.findAll("button").find((button) => button.text() === "Confirm")!.trigger("click");
    await flushPromises();

    expect(plannerApi.deleteSubtask).toHaveBeenCalledWith("first");
    expect(wrapper.find("textarea[placeholder='Subtask']").exists()).toBe(false);
  });
});
