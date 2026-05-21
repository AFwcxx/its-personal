import { compareDate } from "./dates.js";
import { nextDueDate } from "./recurrence.js";
import type { Task } from "./types.js";

export function isComplete(task: Task): boolean {
  return task.completedAt !== null;
}

export function childrenOf(task: Task, tasks: Task[]): Task[] {
  return tasks.filter((candidate) => candidate.parentId === task.id && candidate.deletedAt === null);
}

export function canCompleteTask(task: Task, tasks: Task[]): boolean {
  if (task.deletedAt !== null) return false;
  return childrenOf(task, tasks).every(isComplete);
}

export function visibleArchiveItems(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks
    .filter((task) => task.deletedAt === null && isComplete(task))
    .filter((task) => {
      if (task.parentId === null) return true;
      const parent = byId.get(task.parentId);
      return parent !== undefined && isComplete(parent);
    })
    .sort((a, b) => {
      if (a.parentId === b.id) return 1;
      if (b.parentId === a.id) return -1;
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || sortPlannerItems([a, b]).findIndex((task) => task.id === a.id) - sortPlannerItems([a, b]).findIndex((task) => task.id === b.id);
    });
}

export function sortPlannerItems(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title);
  });
}

export function completedPlannerTasksForDate(tasks: Task[], date: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const rootGroups = sortPlannerItems(tasks.filter((task) => {
    if (task.deletedAt !== null || task.completedAt === null || task.dueDate !== date) return false;
    if (task.parentId === null) return true;
    const parent = byId.get(task.parentId);
    return parent === undefined || parent.deletedAt !== null;
  }));
  const rootIds = new Set(rootGroups.map((task) => task.id));
  const children = sortPlannerItems(tasks.filter((task) => {
    if (task.deletedAt !== null || task.completedAt === null || task.parentId === null) return false;
    return rootIds.has(task.parentId);
  }));
  return [...rootGroups, ...children];
}

export function plannerTasksForDate(tasks: Task[], date: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return sortPlannerItems(
    tasks.filter((task) => {
      if (task.deletedAt !== null || task.dueDate !== date) return false;
      if (task.completedAt === null) return true;
      const parent = task.parentId ? byId.get(task.parentId) : null;
      return parent !== null && parent !== undefined && parent.completedAt === null;
    })
  );
}

export function scheduledTasksForDate(tasks: Task[], date: string): Task[] {
  return sortPlannerItems([
    ...plannerTasksForDate(tasks, date),
    ...tasks
      .filter((task) => isProjectedOccurrence(task, date))
      .map((task) => ({ ...task, dueDate: date }))
  ]);
}

function isProjectedOccurrence(task: Task, date: string): boolean {
  if (task.deletedAt !== null || task.completedAt !== null || task.dueDate === null || task.dueDate >= date) return false;
  let next = nextDueDate(task.dueDate, task.recurrence);
  while (next !== null && next <= date) {
    if (next === date) return true;
    next = nextDueDate(next, task.recurrence);
  }
  return false;
}

export function overdueTasks(tasks: Task[], today: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return sortPlannerItems(
    tasks.filter((task) => {
      if (task.deletedAt !== null || task.dueDate === null || compareDate(task.dueDate, today) >= 0) return false;
      if (task.completedAt === null) return true;
      const parent = task.parentId ? byId.get(task.parentId) : null;
      return parent !== null && parent !== undefined && parent.completedAt === null;
    })
  );
}
