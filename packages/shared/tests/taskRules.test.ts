import { describe, expect, it } from "vitest";
import { canCompleteTask, completedPlannerTasksForDate, overdueTasks, plannerTasksForDate, scheduledTasksForDate, sortPlannerItems, visibleArchiveItems } from "../src/taskRules.js";
import type { Task } from "../src/types.js";

const base = (task: Partial<Task>): Task => ({
  id: task.id ?? "task",
  title: task.title ?? "Task",
  parentId: task.parentId ?? null,
  dueDate: task.dueDate ?? "2026-05-20",
  completedAt: task.completedAt ?? null,
  pinned: task.pinned ?? false,
  tagId: task.tagId ?? null,
  tagIds: task.tagIds ?? [],
  notes: task.notes ?? "",
  recurrence: task.recurrence ?? { type: "none" },
  order: task.order ?? 0,
  createdAt: task.createdAt ?? "2026-05-20T00:00:00.000Z",
  updatedAt: task.updatedAt ?? "2026-05-20T00:00:00.000Z",
  deletedAt: task.deletedAt ?? null
});

describe("task rules", () => {
  it("prevents completing parent until every child is complete", () => {
    expect(canCompleteTask(base({ id: "p" }), [base({ id: "c", parentId: "p" })])).toBe(false);
  });

  it("archives completed child only when parent group is complete", () => {
    const parent = base({ id: "p" });
    const child = base({ id: "c", parentId: "p", completedAt: "2026-05-20T01:00:00.000Z" });
    expect(visibleArchiveItems([parent, child])).toEqual([]);
    expect(visibleArchiveItems([{ ...parent, completedAt: "2026-05-20T02:00:00.000Z" }, child]).map((task) => task.id)).toEqual(["p", "c"]);
  });

  it("keeps completed children in active planner lists until the parent is complete", () => {
    const parent = base({ id: "p" });
    const child = base({ id: "c", parentId: "p", completedAt: "2026-05-20T01:00:00.000Z" });
    expect(plannerTasksForDate([parent, child], "2026-05-20").map((task) => task.id)).toEqual(["p", "c"]);
    expect(overdueTasks([{ ...parent, dueDate: "2026-05-19" }, { ...child, dueDate: "2026-05-19" }], "2026-05-20").map((task) => task.id)).toEqual(["p", "c"]);
  });

  it("groups completed planner tasks by due date so future tabs keep their completed items", () => {
    const future = base({ id: "future", dueDate: "2026-05-22", completedAt: "2026-05-21T01:00:00.000Z" });
    const child = base({ id: "child", parentId: "future", dueDate: "2026-05-22", completedAt: "2026-05-21T01:10:00.000Z" });
    const today = base({ id: "today", dueDate: "2026-05-21", completedAt: "2026-05-21T01:20:00.000Z" });
    expect(completedPlannerTasksForDate([future, child, today], "2026-05-22").map((task) => task.id)).toEqual(["future", "child"]);
  });

  it("projects open recurring tasks into future schedule dates", () => {
    const weekly = base({ id: "weekly", dueDate: "2026-05-21", recurrence: { type: "weekly", ends: { type: "eternity" } } });
    expect(scheduledTasksForDate([weekly], "2026-05-28")).toEqual([{ ...weekly, dueDate: "2026-05-28" }]);
    expect(scheduledTasksForDate([weekly], "2026-06-04")).toEqual([{ ...weekly, dueDate: "2026-06-04" }]);
  });

  it("stops projected recurring tasks after their end date", () => {
    const weekly = base({ id: "weekly", dueDate: "2026-05-21", recurrence: { type: "weekly", ends: { type: "date", date: "2026-05-28" } } });
    expect(scheduledTasksForDate([weekly], "2026-05-28")).toEqual([{ ...weekly, dueDate: "2026-05-28" }]);
    expect(scheduledTasksForDate([weekly], "2026-06-04")).toEqual([]);
  });

  it("sorts pinned above unpinned then manual order", () => {
    expect(sortPlannerItems([base({ id: "b", order: 1 }), base({ id: "a", pinned: true, order: 2 }), base({ id: "c", pinned: true, order: 1 })]).map((task) => task.id)).toEqual(["c", "a", "b"]);
  });
});
