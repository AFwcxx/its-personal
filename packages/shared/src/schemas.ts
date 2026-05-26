import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recurrenceEndSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("eternity") }),
  z.object({ type: z.literal("date"), date: dateSchema })
]);

export const recurrenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("daily"), ends: recurrenceEndSchema }),
  z.object({ type: z.literal("weekly"), ends: recurrenceEndSchema }),
  z.object({ type: z.literal("monthly"), ends: recurrenceEndSchema }),
  z.object({ type: z.literal("yearly"), ends: recurrenceEndSchema }),
  z.object({ type: z.literal("every_n_days"), intervalDays: z.number().int().min(1).max(3660), ends: recurrenceEndSchema })
]);

export const taskInputSchema = z.object({
  id: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  title: z.string().min(1).max(500),
  parentId: z.string().nullable().optional(),
  dueDate: dateSchema,
  pinned: z.boolean().optional(),
  subtasksCollapsed: z.boolean().optional(),
  tagId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  recurrence: recurrenceSchema.optional(),
  order: z.number().optional()
});

export const taskPatchSchema = taskInputSchema.partial().extend({
  completedAt: z.string().datetime().nullable().optional(),
  deletedAt: z.string().datetime().nullable().optional()
});

export const subtaskInputSchema = z.object({
  id: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  title: z.string().min(1).max(500),
  order: z.number().optional()
});

export const subtaskPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  completedAt: z.string().datetime().nullable().optional(),
  order: z.number().optional(),
  deletedAt: z.string().datetime().nullable().optional()
});

const tagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const tagInputSchema = z.object({
  id: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  name: z.string().min(1).max(80),
  color: tagColorSchema.nullable().optional()
});

export const tagPatchSchema = tagInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
  deletedAt: z.string().datetime().nullable().optional()
});

export const noteContentStyleSchema = z.enum(["normal", "checklist", "ordered", "unordered"]);

export const noteListItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(500),
  checked: z.boolean().optional()
});

const noteBaseSchema = z.object({
  id: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  title: z.string().max(500),
  content: z.string().max(20_000),
  contentStyle: noteContentStyleSchema,
  items: z.array(noteListItemSchema),
  pinned: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
  order: z.number().optional()
});

export const noteInputSchema = noteBaseSchema.refine((value) => value.title.trim().length > 0 || value.content.trim().length > 0 || value.items.some((item) => item.text.trim().length > 0), {
  message: "Note requires a title or content"
});

export const notePatchSchema = noteBaseSchema.partial().extend({
  deletedAt: z.string().datetime().nullable().optional()
});

export const linkInputSchema = z.object({
  id: z.string().min(1).optional(),
  operationId: z.string().min(1).optional(),
  taskId: z.string().min(1),
  url: z.string().url(),
  label: z.string().nullable().optional()
});
