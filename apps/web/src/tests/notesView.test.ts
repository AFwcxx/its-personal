import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, Tag } from "@its-personal/shared";
import NotesView from "../views/NotesView.vue";
import { useNotesStore } from "../stores/notes.js";

const sortable = vi.hoisted(() => ({
  instances: [] as Array<{ element: HTMLElement; options: { onEnd?: () => void }; destroy: ReturnType<typeof vi.fn> }>
}));

vi.mock("sortablejs", () => ({
  default: {
    create: vi.fn((element: HTMLElement, options: { onEnd?: () => void }) => {
      const instance = { element, options, destroy: vi.fn() };
      sortable.instances.push(instance);
      return instance;
    })
  }
}));

vi.mock("../services/api.js", () => ({
  loadNotesSnapshot: vi.fn(async () => ({ notes: [], tags: [], changeVersion: 0 })),
  loadNotesChangeVersion: vi.fn(async () => 0),
  cachedNotesSnapshot: vi.fn(() => null),
  loadSnapshot: vi.fn(async () => ({ tasks: [], subtasks: [], tags: [], links: [], attachments: [] })),
  loadPlannerChangeVersion: vi.fn(async () => 0),
  cachedSnapshot: vi.fn(() => null),
  notesApi: {
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn()
  },
  plannerApi: {}
}));

const tag = (patch: Partial<Tag> = {}): Tag => ({
  id: patch.id ?? "tag-personal",
  name: patch.name ?? "Personal",
  color: patch.color ?? "#1d4ed8",
  archivedAt: patch.archivedAt ?? null,
  createdAt: patch.createdAt ?? "2026-05-25T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-25T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

const note = (patch: Partial<Note> = {}): Note => ({
  id: patch.id ?? "note",
  title: patch.title ?? "Note",
  content: patch.content ?? "Content",
  contentStyle: patch.contentStyle ?? "normal",
  items: patch.items ?? [],
  pinned: patch.pinned ?? false,
  tagIds: patch.tagIds ?? [],
  order: patch.order ?? 1000,
  createdAt: patch.createdAt ?? "2026-05-25T00:00:00.000Z",
  updatedAt: patch.updatedAt ?? "2026-05-25T00:00:00.000Z",
  deletedAt: patch.deletedAt ?? null
});

function mountNotesView() {
  const notes = useNotesStore();
  notes.refresh = vi.fn(async () => undefined);
  notes.refreshIfChanged = vi.fn(async () => undefined);
  return mount(NotesView, {
    global: {
      stubs: {
        AppShell: { template: "<main><slot /></main>" },
        Button: { props: ["label", "icon"], template: "<button @click='$emit(\"click\")'><i v-if='icon' :class='icon'></i>{{ label }}<slot /></button>" },
        Checkbox: { template: "<input type='checkbox' />" },
        Dialog: { props: ["visible"], template: "<section v-if='visible'><slot name='header' /><slot /></section>" },
        InputText: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value='modelValue' :placeholder='$attrs.placeholder' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
        Message: { template: "<div><slot /></div>" },
        MultiSelect: {
          props: ["modelValue", "options"],
          emits: ["update:modelValue"],
          template: "<select multiple :value='modelValue' @change='$emit(\"update:modelValue\", Array.from($event.target.selectedOptions).map((option) => option.value))'><option v-for='option in options' :key='option.id' :value='option.id'>{{ option.name }}</option></select>"
        },
        Textarea: { props: ["modelValue"], emits: ["update:modelValue"], template: "<textarea :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" }
      }
    }
  });
}

describe("NotesView", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    sortable.instances = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false }))
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("filters visible notes by search text and any selected managed tag", async () => {
    const notes = useNotesStore();
    notes.tags = [tag({ id: "tag-work", name: "Work" }), tag({ id: "tag-home", name: "Home" })];
    notes.notes = [
      note({ id: "work", title: "Budget plan", tagIds: ["tag-work"] }),
      note({ id: "home", title: "Budget supplies", tagIds: ["tag-home"] }),
      note({ id: "untagged", title: "Budget draft", tagIds: [] }),
      note({ id: "wrong-search", title: "Packing list", tagIds: ["tag-work"] })
    ];

    const wrapper = mountNotesView();
    await wrapper.find("input[placeholder='Search notes']").setValue("budget");
    await wrapper.find("select").setValue(["tag-work", "tag-home"]);

    expect(wrapper.text()).toContain("Budget plan");
    expect(wrapper.text()).toContain("Budget supplies");
    expect(wrapper.text()).not.toContain("Budget draft");
    expect(wrapper.text()).not.toContain("Packing list");
  });

  it("persists the selected note tag filter in localStorage", async () => {
    const notes = useNotesStore();
    notes.tags = [tag({ id: "tag-work", name: "Work" })];
    notes.notes = [note({ id: "work", title: "Work note", tagIds: ["tag-work"] })];

    const wrapper = mountNotesView();
    await wrapper.find("select").setValue(["tag-work"]);

    expect(localStorage.getItem("its-personal-notes-tag-filter")).toBe("[\"tag-work\"]");
  });

  it("reorders notes by the dropped card order inside the current section", async () => {
    const notes = useNotesStore();
    notes.notes = [
      note({ id: "first", title: "First", pinned: true, order: 1000 }),
      note({ id: "second", title: "Second", pinned: true, order: 2000 }),
      note({ id: "third", title: "Third", pinned: true, order: 3000 })
    ];
    notes.reorderNotes = vi.fn();

    const wrapper = mountNotesView();
    await wrapper.vm.$nextTick();

    const cards = wrapper.findAll<HTMLElement>(".note-card");
    cards[0]!.element.parentElement?.append(cards[0]!.element);

    sortable.instances[0]?.options.onEnd?.();

    expect(notes.reorderNotes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "second" }),
      expect.objectContaining({ id: "third" }),
      expect.objectContaining({ id: "first" })
    ]);
  });

  it("disables note reordering while filtered", async () => {
    const notes = useNotesStore();
    notes.tags = [tag({ id: "tag-work", name: "Work" })];
    notes.notes = [
      note({ id: "first", title: "First", tagIds: ["tag-work"], order: 1000 }),
      note({ id: "second", title: "Second", order: 2000 })
    ];

    const wrapper = mountNotesView();
    await wrapper.vm.$nextTick();
    expect(sortable.instances).toHaveLength(1);

    await wrapper.find("select").setValue(["tag-work"]);
    await wrapper.vm.$nextTick();

    expect(sortable.instances[0]?.destroy).toHaveBeenCalled();
    expect(sortable.instances).toHaveLength(1);
  });

  it("removes list entries from the editor only after the user saves", async () => {
    const notes = useNotesStore();
    notes.notes = [
      note({
        id: "list-note",
        title: "List note",
        content: "Alpha\nBeta",
        contentStyle: "unordered",
        items: [
          { id: "item-alpha", text: "Alpha" },
          { id: "item-beta", text: "Beta" }
        ]
      })
    ];
    notes.updateNote = vi.fn(async (_id, patch) => {
      notes.notes = notes.notes.map((candidate) => candidate.id === "list-note" ? { ...candidate, ...patch } : candidate);
      return notes.notes[0];
    });

    const wrapper = mountNotesView();
    await wrapper.find(".note-card").trigger("click");
    const itemInputs = wrapper.findAll(".note-item-input-row input");

    await itemInputs[0]!.trigger("focus");

    expect(wrapper.findAll(".note-item-delete-slot.visible")).toHaveLength(1);

    await wrapper.find(".note-item-delete-slot.visible .note-item-delete-button").trigger("click");

    expect(wrapper.findAll(".note-item-input-row")).toHaveLength(1);
    expect(notes.updateNote).not.toHaveBeenCalled();
    expect(wrapper.findAll(".note-item-delete-slot.visible")).toHaveLength(0);

    await wrapper.findAll("button").find((button) => button.text() === "Save")!.trigger("click");

    expect(notes.updateNote).toHaveBeenCalledWith("list-note", expect.objectContaining({
      items: [{ id: "item-beta", text: "Beta", checked: undefined }],
      content: "Beta"
    }));
  });

  it("shows exact calculate totals and rejects invalid decimal input", async () => {
    const notes = useNotesStore();
    notes.notes = [note({
      contentStyle: "calculate",
      items: [
        { id: "positive", text: "Income", valueCents: 10 },
        { id: "negative", text: "Fee", valueCents: -20 },
        { id: "blank", text: "Pending" }
      ]
    })];
    notes.updateNote = vi.fn();

    const wrapper = mountNotesView();
    expect(wrapper.find(".note-calculate-total strong").text()).toBe("-0.10");
    expect(wrapper.text()).toContain("0.00");

    await wrapper.find(".note-card").trigger("click");
    const value = wrapper.find<HTMLInputElement>("input[aria-label='Value for Income']");
    await value.setValue("1.234");
    await value.trigger("blur");

    expect(wrapper.find(".note-calculate-error").exists()).toBe(true);
    expect(wrapper.findAll(".note-calculate-total strong").at(-1)?.text()).toBe("—");
    await wrapper.findAll("button").find((button) => button.text() === "Save")!.trigger("click");
    expect(notes.updateNote).not.toHaveBeenCalled();
  });
});
