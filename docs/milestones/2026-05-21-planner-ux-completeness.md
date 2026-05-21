# Milestone 2: Planner UX And Workflow Completeness

Date: 2026-05-21
Status: Not started

## Current Understanding

- Milestone 1 created a functional foundation, but several documented planner workflows are basic or incomplete.
- This milestone should make the single-device planner feel complete before adding multi-device sync complexity.
- Source of truth remains `docs/specs/2026-05-20-pwa-todo-planner-design.md` and design assets under `docs/design/`.

## Known Requirements

- Improve planner UI toward `docs/design/gui.png`, `sample-light.png`, and `sample-dark.png`.
- Complete task workflows: subtasks, parent completion restrictions, pinned ordering, manual ordering, completed sections, overdue stability, archive grouping.
- Complete recurrence UI, including custom repeat every `N` days.
- Complete tag management with counts, rename, archive/delete, and filtering.
- Complete link management in task detail.
- Improve mobile drawer and desktop right-panel behavior.
- Add real workflow e2e tests for creating, editing, completing, archiving, and navigating tasks.

## Open Questions

- Should manual ordering use drag-and-drop in this milestone or simple move controls first?
- Should tag delete mean soft archive only, or hard delete hidden from UI?
- Should recurring task completion copy subtasks/links/notes into the next occurrence?

## Decisions Made

- Do not implement operation-log multi-device sync in this milestone.
- Keep SQLite as canonical state and server API as source for edits.
- Keep UI minimal and task-focused; no speculative dashboard or analytics features.

## Progress Log

- 2026-05-21: Milestone created after Milestone 1 completion to document remaining single-device workflow work.
- 2026-05-21: Added tag color creation/editing to Manage Tags, with persisted hex color validation.

## Next Actions

- Audit current UI against `docs/design/gui.png` and list exact gaps.
- Add failing tests for parent/subtask completion, overdue stability, archive grouping, recurrence UI, and tag counts.
- Implement workflow fixes one behavior at a time.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- Update this file after each meaningful step.
