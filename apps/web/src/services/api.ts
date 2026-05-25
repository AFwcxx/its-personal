import type { Attachment, PlannerSnapshot, Subtask, Tag, Task, TaskLink } from "@its-personal/shared";
import { useSessionStore } from "../stores/session.js";

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = useSessionStore();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...session.authHeaders(),
      ...init.headers
    }
  });
  if (response.status === 401) session.lockLocal();
  if (!response.ok) throw new Error(await response.text());
  session.recordActivity(false);
  return response.json() as Promise<T>;
}

export async function loadSnapshot(): Promise<PlannerSnapshot> {
  const snapshot = await apiJson<PlannerSnapshot>("/api/planner/snapshot");
  localStorage.setItem("its-personal-last-snapshot", JSON.stringify(snapshot));
  return snapshot;
}

export async function loadPlannerChangeVersion(): Promise<number> {
  const session = useSessionStore();
  const response = await fetch("/api/planner/changes", { headers: session.authHeaders() });
  if (response.status === 401) session.lockLocal();
  if (!response.ok) throw new Error(await response.text());
  const body = await response.json() as { version: number };
  return body.version;
}

export function cachedSnapshot(): PlannerSnapshot | null {
  const raw = localStorage.getItem("its-personal-last-snapshot");
  return raw ? JSON.parse(raw) as PlannerSnapshot : null;
}

type WriteMeta = { id?: string; operationId?: string };

export const plannerApi = {
  createTask: (body: Partial<Task> & { title: string } & WriteMeta) => apiJson<Task>("/api/planner/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<Task>) => apiJson<Task>(`/api/planner/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  completeTask: (id: string) => apiJson<Task>(`/api/planner/tasks/${id}/complete`, { method: "POST" }),
  deleteTask: (id: string, body: { operationId?: string } = {}) => authenticatedFetch(`/api/planner/tasks/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  createSubtask: (body: Pick<Subtask, "taskId" | "title"> & Partial<Subtask> & WriteMeta) => apiJson<Subtask>("/api/planner/subtasks", { method: "POST", body: JSON.stringify(body) }),
  updateSubtask: (id: string, body: Partial<Subtask>) => apiJson<Subtask>(`/api/planner/subtasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSubtask: (id: string, body: { operationId?: string } = {}) => authenticatedFetch(`/api/planner/subtasks/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  createTag: (body: Pick<Tag, "name"> & Partial<Tag> & WriteMeta) => apiJson<Tag>("/api/planner/tags", { method: "POST", body: JSON.stringify(body) }),
  updateTag: (id: string, body: Partial<Tag>) => apiJson<Tag>(`/api/planner/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTag: (id: string, body: { operationId?: string } = {}) => authenticatedFetch(`/api/planner/tags/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  createLink: (body: Pick<TaskLink, "taskId" | "url"> & Partial<TaskLink> & WriteMeta) => apiJson<TaskLink>("/api/planner/links", { method: "POST", body: JSON.stringify(body) }),
  deleteLink: (id: string, body: { operationId?: string } = {}) => authenticatedFetch(`/api/planner/links/${id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
};

export async function uploadAttachment(taskId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("file", file);
  const response = await authenticatedFetch("/api/attachments", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<Attachment>;
}

export async function openAttachment(id: string): Promise<void> {
  const opened = window.open("", "_blank");
  const response = await authenticatedFetch(`/api/attachments/${id}`);
  if (!response.ok) throw new Error(await response.text());
  const blobUrl = URL.createObjectURL(await response.blob());
  if (opened) {
    opened.location.href = blobUrl;
  } else {
    window.location.href = blobUrl;
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  const response = await authenticatedFetch(`/api/attachments/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = useSessionStore();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...session.authHeaders(),
      ...init.headers
    }
  });
  if (response.status === 401) session.lockLocal();
  if (response.ok) session.recordActivity(false);
  return response;
}
