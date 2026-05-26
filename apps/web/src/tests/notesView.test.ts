import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, Tag } from "@its-personal/shared";
import NotesView from "../views/NotesView.vue";
import { useNotesStore } from "../stores/notes.js";

vi.mock("sortablejs", () => ({
  default: {
    create: vi.fn(() => ({ destroy: vi.fn() }))
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
});
