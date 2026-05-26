import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, NotesSnapshot } from "@its-personal/shared";
import { cachedNotesSnapshot, loadNotesSnapshot, notesApi } from "../services/api.js";
import { clearPendingOperations, savePendingOperation } from "../services/offline.js";
import { useNotesStore } from "../stores/notes.js";

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

describe("notes store offline projection", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    await clearPendingOperations();
  });

  it("replays pending note creates over the cached notes snapshot", async () => {
    vi.mocked(loadNotesSnapshot).mockRejectedValue(new TypeError("offline"));
    vi.mocked(cachedNotesSnapshot).mockReturnValue({ notes: [note({ id: "cached", title: "Cached" })], tags: [] } as NotesSnapshot);
    await savePendingOperation({
      operationId: "op-create-note",
      entityType: "note",
      entityId: "note-local",
      method: "POST",
      path: "/api/notes",
      body: {
        id: "note-local",
        operationId: "op-create-note",
        title: "",
        content: "Offline note",
        contentStyle: "normal",
        items: [],
        pinned: false,
        tagIds: []
      },
      state: "pending",
      retryable: true,
      createdAt: "2026-05-25T01:00:00.000Z",
      updatedAt: "2026-05-25T01:00:00.000Z"
    });

    const notes = useNotesStore();
    await notes.refresh();

    expect(notes.status).toBe("offline");
    expect(notes.notes.map((candidate) => candidate.content)).toEqual(["Offline note", "Content"]);
  });

  it("toggles checklist items through note updates", async () => {
    const notes = useNotesStore();
    notes.notes = [note({
      contentStyle: "checklist",
      items: [{ id: "item-1", text: "Buy milk", checked: false }]
    })];
    vi.mocked(notesApi.updateNote).mockResolvedValue(note({
      contentStyle: "checklist",
      items: [{ id: "item-1", text: "Buy milk", checked: true }]
    }));

    await notes.toggleChecklistItem("note", "item-1");

    expect(notes.notes[0]?.items[0]?.checked).toBe(true);
  });
});
