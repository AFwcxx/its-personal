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
  title: z.string().min(1).max(500),
  parentId: z.string().nullable().optional(),
  dueDate: dateSchema,
  pinned: z.boolean().optional(),
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

const tagColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const tagInputSchema = z.object({
  name: z.string().min(1).max(80),
  color: tagColorSchema.nullable().optional()
});

export const tagPatchSchema = tagInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
  deletedAt: z.string().datetime().nullable().optional()
});

export const linkInputSchema = z.object({
  taskId: z.string().min(1),
  url: z.string().url(),
  label: z.string().nullable().optional()
});
