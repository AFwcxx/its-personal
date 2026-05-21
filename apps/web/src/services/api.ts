import type { Attachment, PlannerSnapshot, Tag, Task, TaskLink } from "@its-personal/shared";
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
  if (response.status === 401) session.lock();
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function loadSnapshot(): Promise<PlannerSnapshot> {
  const snapshot = await apiJson<PlannerSnapshot>("/api/planner/snapshot");
  localStorage.setItem("its-personal-last-snapshot", JSON.stringify(snapshot));
  return snapshot;
}

export function cachedSnapshot(): PlannerSnapshot | null {
  const raw = localStorage.getItem("its-personal-last-snapshot");
  return raw ? JSON.parse(raw) as PlannerSnapshot : null;
}

export const plannerApi = {
  createTask: (body: Partial<Task> & { title: string }) => apiJson<Task>("/api/planner/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<Task>) => apiJson<Task>(`/api/planner/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  completeTask: (id: string) => apiJson<Task>(`/api/planner/tasks/${id}/complete`, { method: "POST" }),
  deleteTask: (id: string) => fetch(`/api/planner/tasks/${id}`, { method: "DELETE", headers: useSessionStore().authHeaders() }),
  createTag: (body: Pick<Tag, "name"> & Partial<Tag>) => apiJson<Tag>("/api/planner/tags", { method: "POST", body: JSON.stringify(body) }),
  updateTag: (id: string, body: Partial<Tag>) => apiJson<Tag>(`/api/planner/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTag: (id: string) => fetch(`/api/planner/tags/${id}`, { method: "DELETE", headers: useSessionStore().authHeaders() }),
  createLink: (body: Pick<TaskLink, "taskId" | "url"> & Partial<TaskLink>) => apiJson<TaskLink>("/api/planner/links", { method: "POST", body: JSON.stringify(body) }),
  deleteLink: (id: string) => fetch(`/api/planner/links/${id}`, { method: "DELETE", headers: useSessionStore().authHeaders() })
};

export async function uploadAttachment(taskId: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("file", file);
  const response = await fetch("/api/attachments", { method: "POST", headers: useSessionStore().authHeaders(), body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<Attachment>;
}
