import { addDays, normalizeRecurrence, overdueTasks, plannerTasksForDate, scheduledTasksForDate, sortPlannerItems, todayISO, visibleArchiveItems, type Attachment, type PlannerSnapshot, type Subtask, type Tag, type Task, type TaskLink } from "@its-personal/shared";
import { defineStore } from "pinia";
import { cachedSnapshot, loadSnapshot, plannerApi } from "../services/api.js";

export const usePlannerStore = defineStore("planner", {
  state: () => ({
    tasks: [] as Task[],
    subtasks: [] as Subtask[],
    tags: [] as Tag[],
    links: [] as TaskLink[],
    attachments: [] as Attachment[],
    selectedTaskId: null as string | null,
    currentDate: todayISO(),
    status: "idle" as "idle" | "loading" | "offline" | "error",
    error: ""
  }),
  getters: {
    selectedTask: (state) => state.tasks.find((task) => task.id === state.selectedTaskId) ?? null,
    activeTags: (state) => state.tags.filter((tag) => !tag.deletedAt && !tag.archivedAt),
    archiveTasks: (state) => visibleArchiveItems(state.tasks),
    today: (state) => state.currentDate
  },
  actions: {
    apply(snapshot: PlannerSnapshot) {
      this.tasks = snapshot.tasks.map((task) => ({
        ...task,
        tagIds: task.tagIds ?? (task.tagId ? [task.tagId] : []),
        recurrence: normalizeRecurrence(task.recurrence)
      }));
      this.subtasks = snapshot.subtasks ?? [];
      this.currentDate = snapshot.today ?? this.currentDate;
      this.tags = snapshot.tags;
      this.links = snapshot.links;
      this.attachments = snapshot.attachments;
    },
    async refresh() {
      this.status = "loading";
      try {
        this.apply(await loadSnapshot());
        this.status = "idle";
      } catch (error) {
        const cached = cachedSnapshot();
        if (cached) {
          this.apply(cached);
          this.status = "offline";
        } else {
          this.status = "error";
          this.error = error instanceof Error ? error.message : "Unable to load planner";
        }
      }
    },
    tasksFor(date: string) {
      return plannerTasksForDate(this.tasks, date);
    },
    scheduledTasksFor(date: string) {
      return scheduledTasksForDate(this.tasks, date);
    },
    overdue() {
      return overdueTasks(this.tasks, this.currentDate);
    },
    allVisible(search = "", showCompleted = false) {
      const q = search.toLowerCase();
      return sortPlannerItems(this.tasks.filter((task) => !task.deletedAt && (showCompleted || !task.completedAt) && task.title.toLowerCase().includes(q)));
    },
    async createTask(title: string, dueDate?: string, parentId: string | null = null) {
      const task = await plannerApi.createTask({ title, dueDate: dueDate ?? this.currentDate, parentId });
      this.tasks.push(task);
      return task;
    },
    async createSubtask(taskId: string, title: string) {
      const subtask = await plannerApi.createSubtask({ taskId, title });
      this.subtasks.push(subtask);
      return subtask;
    },
    async updateTask(id: string, patch: Partial<Task>) {
      const task = await plannerApi.updateTask(id, patch);
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
      return task;
    },
    async updateSubtask(id: string, patch: Partial<Subtask>) {
      const subtask = await plannerApi.updateSubtask(id, patch);
      this.subtasks = this.subtasks.map((candidate) => candidate.id === id ? subtask : candidate);
      return subtask;
    },
    async completeTask(id: string) {
      const task = await plannerApi.completeTask(id);
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
    },
    async toggleSubtask(id: string) {
      const subtask = this.subtasks.find((candidate) => candidate.id === id);
      if (!subtask) return;
      await this.updateSubtask(id, { completedAt: subtask.completedAt ? null : new Date().toISOString() });
    },
    async reorderTasks(tasks: Task[]) {
      const updates = tasks.map((task, index) => ({ ...task, order: (index + 1) * 1000 }));
      this.tasks = this.tasks.map((task) => updates.find((updated) => updated.id === task.id) ?? task);
      for (const task of updates) {
        await plannerApi.updateTask(task.id, { order: task.order });
      }
    },
    async reorderSubtasks(subtasks: Subtask[]) {
      const updates = subtasks.map((subtask, index) => ({ ...subtask, order: (index + 1) * 1000 }));
      this.subtasks = this.subtasks.map((subtask) => updates.find((updated) => updated.id === subtask.id) ?? subtask);
      for (const subtask of updates) {
        await plannerApi.updateSubtask(subtask.id, { order: subtask.order });
      }
    },
    async deleteTask(id: string) {
      await plannerApi.deleteTask(id);
      this.tasks = this.tasks.map((task) => task.id === id ? { ...task, deletedAt: new Date().toISOString() } : task);
      this.subtasks = this.subtasks.map((subtask) => subtask.taskId === id ? { ...subtask, deletedAt: new Date().toISOString() } : subtask);
    },
    async deleteSubtask(id: string) {
      await plannerApi.deleteSubtask(id);
      this.subtasks = this.subtasks.map((subtask) => subtask.id === id ? { ...subtask, deletedAt: new Date().toISOString() } : subtask);
    },
    dateForTab(tab: string) {
      if (tab === "today") return this.currentDate;
      if (tab === "tomorrow") return addDays(this.currentDate, 1);
      if (tab === "day-after") return addDays(this.currentDate, 2);
      return this.currentDate;
    }
  }
});
