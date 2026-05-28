import type { Note, NoteContentStyle, NoteListItem, NotesSnapshot, Tag } from "@its-personal/shared";
import { defineStore } from "pinia";
import { cachedNotesSnapshot, loadNotesChangeVersion, loadNotesSnapshot, notesApi } from "../services/api.js";
import { generateLocalId, hasDurableOutbox, markPendingOperationFailed, pendingOperations, removePendingOperation, saveCompactedPendingOperation, sendPendingOperation, shouldShowOfflineDialog, type PendingOperation } from "../services/offline.js";
import { usePlannerStore } from "./planner.js";
import { useSessionStore } from "./session.js";

export const useNotesStore = defineStore("notes", {
  state: () => ({
    notes: [] as Note[],
    tags: [] as Tag[],
    status: "idle" as "idle" | "loading" | "offline" | "error",
    error: "",
    changeVersion: null as number | null
  }),
  getters: {
    activeTags: (state) => state.tags.filter((tag) => !tag.deletedAt && !tag.archivedAt),
    visibleNotes: (state) => state.notes.filter((note) => note.deletedAt === null)
  },
  actions: {
    apply(snapshot: NotesSnapshot) {
      this.notes = (snapshot.notes ?? []).map(normalizeNote);
      this.tags = snapshot.tags ?? [];
      this.changeVersion = snapshotChangeVersion(snapshot) ?? this.changeVersion;
    },
    async refresh() {
      this.status = "loading";
      try {
        await usePlannerStore().syncPending();
        this.apply(await loadNotesSnapshot());
        await this.applyPendingProjection();
        this.status = "idle";
        await usePlannerStore().refreshPendingStatus();
      } catch (error) {
        const cached = cachedNotesSnapshot();
        if (cached) {
          this.apply(cached);
          await this.applyPendingProjection();
          this.status = "offline";
        } else {
          this.apply({ notes: [], tags: [] });
          await this.applyPendingProjection();
          this.status = usePlannerStore().pendingCount > 0 ? "offline" : "error";
          this.error = error instanceof Error ? error.message : "Unable to load notes";
        }
        await usePlannerStore().refreshPendingStatus();
      }
    },
    async refreshIfChanged() {
      const version = await loadNotesChangeVersion();
      if (this.changeVersion === null) {
        this.changeVersion = version;
        return;
      }
      if (version !== this.changeVersion) await this.refresh();
    },
    async createNote(input: EditableNote) {
      const now = new Date().toISOString();
      const id = generateLocalId("note");
      const operationId = generateLocalId("op");
      const note = normalizeNote({
        id,
        title: input.title,
        content: input.content,
        contentStyle: input.contentStyle,
        items: input.items,
        pinned: input.pinned,
        tagIds: input.tagIds,
        order: Date.now(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      });
      this.notes = [note, ...this.notes];
      const saved = await this.writeOperation<Note>({
        operationId,
        entityType: "note",
        entityId: id,
        method: "POST",
        path: "/api/notes",
        body: { ...note, operationId },
        state: "pending",
        retryable: true,
        createdAt: now,
        updatedAt: now
      });
      if (saved) this.notes = this.notes.map((candidate) => candidate.id === id ? normalizeNote(saved) : candidate);
      return saved ?? note;
    },
    async updateNote(id: string, patch: Partial<Note>) {
      const current = this.notes.find((note) => note.id === id);
      if (!current) return undefined;
      const optimistic = normalizeNote({ ...current, ...patch, updatedAt: new Date().toISOString() });
      this.notes = this.notes.map((note) => note.id === id ? optimistic : note);
      const operationId = generateLocalId("op");
      const saved = await this.writeOperation<Note>({
        operationId,
        entityType: "note",
        entityId: id,
        method: "PATCH",
        path: `/api/notes/${id}`,
        body: { ...patch, operationId },
        base: baseForPatch(current, patch),
        state: "pending",
        retryable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      if (saved) this.notes = this.notes.map((note) => note.id === id ? reconcileNoteResponse(note, optimistic, saved) : note);
      return saved ?? optimistic;
    },
    async deleteNote(id: string) {
      const operationId = generateLocalId("op");
      await this.writeOperation<void>({
        operationId,
        entityType: "note",
        entityId: id,
        method: "DELETE",
        path: `/api/notes/${id}`,
        body: { operationId },
        state: "pending",
        retryable: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      this.notes = this.notes.map((note) => note.id === id ? { ...note, deletedAt: new Date().toISOString() } : note);
    },
    async reorderNotes(notes: Note[]) {
      const originalById = new Map(this.notes.map((note) => [note.id, note]));
      const updates = notes.map((note, index) => ({ ...note, order: (index + 1) * 1000 }));
      this.notes = this.notes.map((note) => updates.find((updated) => updated.id === note.id) ?? note);
      for (const note of updates) {
        const original = originalById.get(note.id);
        if (!original || original.order === note.order) continue;
        const operationId = generateLocalId("op");
        const saved = await this.writeOperation<Note>({
          operationId,
          entityType: "note",
          entityId: note.id,
          method: "PATCH",
          path: `/api/notes/${note.id}`,
          body: { order: note.order, operationId },
          base: { order: original.order },
          state: "pending",
          retryable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        if (saved) this.notes = this.notes.map((candidate) => candidate.id === note.id ? normalizeNote(saved) : candidate);
      }
    },
    async toggleChecklistItem(noteId: string, itemId: string) {
      const note = this.notes.find((candidate) => candidate.id === noteId);
      if (!note || note.contentStyle !== "checklist") return;
      await this.updateNote(noteId, {
        items: note.items.map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item)
      });
    },
    async writeOperation<T>(operation: PendingOperation) {
      const compacted = await saveCompactedPendingOperation(operation);
      const planner = usePlannerStore();
      if (!compacted) {
        await planner.refreshPendingStatus();
        return undefined;
      }
      try {
        if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom") && !hasDurableOutbox()) {
          return await this.writeOperationDirect<T>(compacted);
        }
        const session = useSessionStore();
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          await planner.refreshPendingStatus();
          if (shouldShowOfflineDialog()) planner.savedOfflineDialogVisible = true;
          return undefined;
        }
        const response = await sendPendingOperation(compacted, session);
        if (response.status === 401) {
          session.lockLocal();
          await planner.refreshPendingStatus();
          return undefined;
        }
        if (!response.ok) {
          await markPendingOperationFailed(compacted.operationId, response.status >= 500);
          await planner.refreshPendingStatus();
          if (response.status >= 400 && response.status < 500) return undefined;
          throw new Error(await response.text());
        }
        await removePendingOperation(compacted.operationId);
        await planner.refreshPendingStatus();
        return response.status === 204 ? undefined : await response.json() as T;
      } catch {
        if (shouldShowOfflineDialog()) planner.savedOfflineDialogVisible = true;
        await planner.refreshPendingStatus();
        return undefined;
      }
    },
    async writeOperationDirect<T>(operation: PendingOperation) {
      const body = { ...operation.body };
      delete body.operationId;
      delete body.id;
      if (operation.entityType === "note" && operation.method === "POST") return await notesApi.createNote(body as Parameters<typeof notesApi.createNote>[0]) as T;
      if (operation.entityType === "note" && operation.method === "PATCH") return await notesApi.updateNote(operation.entityId, body as Partial<Note>) as T;
      if (operation.entityType === "note" && operation.method === "DELETE") return await notesApi.deleteNote(operation.entityId) as T;
      return undefined as T;
    },
    async applyPendingProjection() {
      const operations = await pendingOperations();
      for (const operation of operations) {
        if (operation.entityType === "note") this.applyPendingNoteOperation(operation);
      }
    },
    applyPendingNoteOperation(operation: PendingOperation) {
      const existing = this.notes.find((note) => note.id === operation.entityId);
      if (operation.method === "POST") {
        const note = noteFromPendingOperation(operation, existing);
        this.notes = existing ? this.notes.map((candidate) => candidate.id === note.id ? note : candidate) : [note, ...this.notes];
        return;
      }
      if (operation.method === "PATCH" && existing) {
        this.notes = this.notes.map((note) => note.id === operation.entityId ? normalizeNote({ ...note, ...bodyWithoutOperationId(operation.body), updatedAt: operation.updatedAt } as Note) : note);
        return;
      }
      if (operation.method === "DELETE" && existing) {
        this.notes = this.notes.map((note) => note.id === operation.entityId ? { ...note, deletedAt: operation.updatedAt } : note);
      }
    }
  }
});

export type EditableNote = Pick<Note, "title" | "content" | "contentStyle" | "items" | "pinned" | "tagIds">;

export function textToItems(text: string, checked = false): NoteListItem[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ id: generateLocalId("note_item"), text: line, checked }));
}

function normalizeNote(note: Note): Note {
  return {
    ...note,
    title: note.title ?? "",
    content: note.content ?? "",
    contentStyle: note.contentStyle ?? "normal",
    items: Array.isArray(note.items) ? note.items : [],
    tagIds: note.tagIds ?? [],
    deletedAt: note.deletedAt ?? null
  };
}

function noteFromPendingOperation(operation: PendingOperation, existing?: Note): Note {
  const body = operation.body;
  return normalizeNote({
    id: operation.entityId,
    title: stringValue(body.title, existing?.title ?? ""),
    content: stringValue(body.content, existing?.content ?? ""),
    contentStyle: contentStyleValue(body.contentStyle, existing?.contentStyle ?? "normal"),
    items: Array.isArray(body.items) ? body.items.filter(isNoteListItem) : existing?.items ?? [],
    pinned: booleanValue(body.pinned, existing?.pinned ?? false),
    tagIds: Array.isArray(body.tagIds) ? body.tagIds.filter((tagId): tagId is string => typeof tagId === "string") : existing?.tagIds ?? [],
    order: numberValue(body.order, existing?.order ?? Date.parse(operation.createdAt)),
    createdAt: existing?.createdAt ?? operation.createdAt,
    updatedAt: operation.updatedAt,
    deletedAt: nullableStringValue(body.deletedAt, existing?.deletedAt ?? null)
  });
}

function reconcileNoteResponse(current: Note, optimistic: Note, response: Note): Note {
  const reconciled = { ...response };
  for (const key of Object.keys(current) as Array<keyof Note>) {
    if (JSON.stringify(current[key]) !== JSON.stringify(optimistic[key])) {
      reconciled[key] = current[key] as never;
    }
  }
  return normalizeNote(reconciled);
}

function baseForPatch<T extends Record<string, unknown>>(current: T, patch: Partial<T>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, current[key]]));
}

function bodyWithoutOperationId(body: Record<string, unknown>): Record<string, unknown> {
  const { operationId: _operationId, ...rest } = body;
  return rest;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function contentStyleValue(value: unknown, fallback: NoteContentStyle): NoteContentStyle {
  return value === "checklist" || value === "ordered" || value === "unordered" || value === "normal" ? value : fallback;
}

function isNoteListItem(value: unknown): value is NoteListItem {
  return typeof value === "object" && value !== null && typeof (value as NoteListItem).id === "string" && typeof (value as NoteListItem).text === "string";
}

function snapshotChangeVersion(snapshot: NotesSnapshot): number | undefined {
  const candidate = snapshot as NotesSnapshot & { changeVersion?: unknown };
  return typeof candidate.changeVersion === "number" ? candidate.changeVersion : undefined;
}
