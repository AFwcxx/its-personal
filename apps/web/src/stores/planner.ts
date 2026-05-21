import { addDays, overdueTasks, plannerTasksForDate, sortPlannerItems, todayISO, visibleArchiveItems, type Attachment, type PlannerSnapshot, type Tag, type Task, type TaskLink } from "@its-personal/shared";
import { defineStore } from "pinia";
import { cachedSnapshot, loadSnapshot, plannerApi } from "../services/api.js";

export const usePlannerStore = defineStore("planner", {
  state: () => ({
    tasks: [] as Task[],
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
    today: () => todayISO()
  },
  actions: {
    apply(snapshot: PlannerSnapshot) {
      this.tasks = snapshot.tasks;
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
    overdue() {
      return overdueTasks(this.tasks, todayISO());
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
    async updateTask(id: string, patch: Partial<Task>) {
      const task = await plannerApi.updateTask(id, patch);
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
      return task;
    },
    async completeTask(id: string) {
      const task = await plannerApi.completeTask(id);
      this.tasks = this.tasks.map((candidate) => candidate.id === id ? task : candidate);
    },
    async reorderTasks(tasks: Task[]) {
      const updates = tasks.map((task, index) => ({ ...task, order: (index + 1) * 1000 }));
      this.tasks = this.tasks.map((task) => updates.find((updated) => updated.id === task.id) ?? task);
      for (const task of updates) {
        await plannerApi.updateTask(task.id, { order: task.order });
      }
    },
    async deleteTask(id: string) {
      await plannerApi.deleteTask(id);
      this.tasks = this.tasks.map((task) => task.id === id ? { ...task, deletedAt: new Date().toISOString() } : task);
    },
    dateForTab(tab: string) {
      if (tab === "today") return todayISO();
      if (tab === "tomorrow") return addDays(todayISO(), 1);
      if (tab === "day-after") return addDays(todayISO(), 2);
      return todayISO();
    }
  }
});
