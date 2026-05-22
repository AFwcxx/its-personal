export type RecurrenceEnd =
  | { type: "eternity" }
  | { type: "date"; date: string };

export type Recurrence =
  | { type: "none" }
  | { type: "daily"; ends: RecurrenceEnd }
  | { type: "weekly"; ends: RecurrenceEnd }
  | { type: "monthly"; ends: RecurrenceEnd }
  | { type: "yearly"; ends: RecurrenceEnd }
  | { type: "every_n_days"; intervalDays: number; ends: RecurrenceEnd };

export interface Task {
  id: string;
  title: string;
  parentId: string | null;
  dueDate: string;
  completedAt: string | null;
  pinned: boolean;
  subtasksCollapsed: boolean;
  tagId: string | null;
  tagIds: string[];
  notes: string;
  recurrence: Recurrence;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskLink {
  id: string;
  taskId: string;
  url: string;
  label: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface Attachment {
  id: string;
  taskId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface PlannerSnapshot {
  tasks: Task[];
  subtasks: Subtask[];
  tags: Tag[];
  links: TaskLink[];
  attachments: Attachment[];
  today?: string;
  timezone?: string;
}

export interface FieldValue<T = unknown> {
  value: T;
  modifiedAt: string;
  deviceId: string;
}
