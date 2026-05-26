# Milestone 2: Planner UX And Workflow Completeness

Date: 2026-05-21
Status: In progress

## Current Understanding

- Milestone 1 created a functional foundation, but several documented planner workflows are basic or incomplete.
- This milestone should make the single-device planner feel complete before adding multi-device sync complexity.
- Source of truth remains `docs/specs/2026-05-20-pwa-todo-planner-design.md` and design assets under `docs/design/`.

## Known Requirements

- Improve planner UI toward `docs/design/gui.png` and the dark cyberpunk neon direction.
- Complete task workflows: subtasks, parent completion restrictions, pinned ordering, manual ordering, completed sections, overdue stability, archive grouping.
- Complete recurrence UI, including custom repeat every `N` days and inclusive recurrence end dates.
- Complete tag management with counts, rename, archive/delete, and filtering.
- Complete link management in task detail.
- Improve mobile drawer and desktop right-panel behavior.
- Add real workflow e2e tests for creating, editing, completing, archiving, and navigating tasks.

## Open Questions

- Should recurring task completion copy subtasks/links/notes into the next occurrence?

## Decisions Made

- Do not implement operation-log multi-device sync in this milestone.
- Keep SQLite as canonical state and server API as source for edits.
- Keep UI minimal and task-focused; no speculative dashboard or analytics features.
- Completed sections start collapsed and remember expanded/collapsed state during navigation.
- Overdue completed tasks move into an Overdue completed section and remain there for 24 hours after completion.
- Planner daily completed sections use task due date so completed future tasks remain visible in Tomorrow and Day After completed groups.
- Manual drag reorder is limited to Planner Today, Tomorrow, Day After, and Overdue.
- All Tasks and Archive group rows by date; All Tasks groups by due date and Archive groups by parent completion date.
- Tag delete requires confirmation. Tags assigned to active tasks are archived/hidden instead of hard-deleted.

## Progress Log

- 2026-05-21: Milestone created after Milestone 1 completion to document remaining single-device workflow work.
- 2026-05-21: Added tag color creation/editing to Manage Tags, with persisted hex color validation.
- 2026-05-21: Migrated visible form and action controls to PrimeVue while preserving the black/white/yellow visual concept from the reference screenshots.
- 2026-05-21: Verified PrimeVue migration with typecheck, unit tests, production build, Docker rebuild on `127.0.0.1:3009`, health check, e2e smoke test, and deployed Tags page screenshot.
- 2026-05-21: Tuned PrimeVue control styling to match the referenced ChatGPT-style dark/light input bars: pill radius, mode-specific surfaces, softer borders, icon-sized buttons, and light-mode shadow.
- 2026-05-21: Changed Docker Compose published port back to `127.0.0.1:3009` because host port `3002` is already owned by an unrelated `cokeeps-admin` container.
- 2026-05-21: Recreated Docker Compose service on `127.0.0.1:3009` and verified `GET /api/health` returns `{"ok":true}`.
- 2026-05-21: Aligned Planner search with the day filter pills, restored active highlights for sidebar and Planner pills, fixed Tomorrow/Day After completed sections to group completed tasks by due date, and faded non-current Schedule month days to 30% content opacity.

## Next Actions

- Audit current UI against `docs/design/gui.png` and list exact gaps.
- Add failing tests for parent/subtask completion, overdue stability, archive grouping, recurrence UI, and tag counts.
- Implement workflow fixes one behavior at a time.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- Update this file after each meaningful step.
