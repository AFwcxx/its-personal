export type Recurrence =
  | { type: "none" }
  | { type: "daily" }
  | { type: "weekly" }
  | { type: "monthly" }
  | { type: "yearly" }
  | { type: "every_n_days"; intervalDays: number };

export interface Task {
  id: string;
  title: string;
  parentId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  pinned: boolean;
  tagId: string | null;
  tagIds: string[];
  notes: string;
  recurrence: Recurrence;
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
  tags: Tag[];
  links: TaskLink[];
  attachments: Attachment[];
}

export interface FieldValue<T = unknown> {
  value: T;
  modifiedAt: string;
  deviceId: string;
}
