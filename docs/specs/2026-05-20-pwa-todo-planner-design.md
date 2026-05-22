# PWA To-do Planner Design

Date: 2026-05-20

## Summary

Build a single-user, offline-capable PWA to-do/planner app in TypeScript. The frontend is a Vue 3 PWA. The backend is Node.js + Express with SQLite as the canonical database. The app is deployed with Docker Compose, uses a simple password unlock with server-side idle session locking, stores uploaded attachments in a Docker volume, and syncs offline changes through an operation log.

The MVP is end-to-end and intentionally lean: it should be usable as a personal planner across devices, work offline for task management, sync when online, and follow the provided planner mockup and design samples.

## Inputs

- Planner mockup: `docs/plan/gui.excalidraw`, `docs/plan/gui.png`
- Light theme sample: `docs/design/sample-light.png`
- Dark theme sample: `docs/design/sample-dark.png`

## Goals

- Provide a mobile-first planner app with per-day planning, overdue tasks, all tasks, schedule calendar, archive, and tag management.
- Support offline viewing and editing of planner data.
- Sync edits between devices when connectivity returns.
- Store canonical data in local SQLite on the server.
- Support standard uploaded attachments stored on the server and cached offline on demand.
- Require a simple password after a tab is locked, dormant past the configured idle timeout, or invalidated by password change.
- Run through Docker Compose and be reachable only locally or through Tailscale/local networking by default.

## Non-goals

- Multi-user accounts, roles, sharing, or collaboration.
- Public internet hardening beyond private-network access controls.
- Full calendar recurrence rules such as weekdays-only, nth weekday, exceptions, or count-based limits.
- Full UI import/restore workflow for backups.
- Real-time multi-user presence or push notifications.

## Architecture

Use a TypeScript monorepo with three main workspaces:

- `apps/web`: Vite + Vue 3 PWA. It owns offline UX, IndexedDB storage, service worker caching, touch interactions, and responsive UI.
- `apps/api`: Node.js + Express API. It owns password unlock, server-side idle session validation, SQLite persistence, sync operation ingestion, state queries, backup export, and attachment upload/download.
- `packages/shared`: shared TypeScript types, validation schemas, recurrence helpers, date utilities, and sync operation definitions.

Docker Compose runs the built web/API service with:

- a SQLite data volume,
- an attachment volume,
- environment variables for password, timezone, bind host/port, session settings, and storage limits.

The default deployment binds to localhost/private interfaces. Tailscale access is documented as either binding to a Tailscale interface or placing the app behind a Tailnet-only reverse proxy. The app should not be exposed publicly by default.

## Authentication

The app is single-user. The password is configured through Docker Compose, normally via an environment variable or `.env` file referenced by Compose.

Unlock flow:

1. The PWA asks for the password when the current browser tab has no valid unlocked session.
2. The API verifies the password, creates a SQLite-backed server session, and issues a signed bearer token for that server session.
3. The PWA stores the token in tab-scoped session storage, not persistent local storage.
4. Browser UI activity, including pointer, click, touch, keyboard, scroll, and focus activity, updates the local idle timer and sends a throttled authenticated activity heartbeat. Successful authenticated API calls also count as activity.
5. The API rejects tokens whose server session has been dormant longer than `SESSION_IDLE_TIMEOUT_SECONDS`, whose session was manually locked, or whose password fingerprint no longer matches the current configured `APP_PASSWORD`.
6. Sessions have no daily boundary expiry. An actively used session can continue indefinitely until manual lock, idle expiry, token invalidation, or app password change.

Each browser/device also has a stable `device_id` used for sync attribution and deterministic conflict tie-breaking. The `device_id` is not a user account.

## Core Screens

### Planner / Per-day Page

The Planner page supports Overdue, Today, Tomorrow, and Day After tabs. It shows the selected day or overdue grouping, a search field, pinned tasks first, and a completed section for the day.

The completed section starts collapsed by default and remembers its previous expanded/collapsed state while the user navigates through the app. For Today, Tomorrow, and Day After, completed task groups are grouped by the parent task's `completed_at` date. A completed subtask does not appear as its own completed item unless its parent task and siblings are also complete.

Task rows with visible subtasks show a chevron control before the pin action. The chevron toggles only that task's subtask list, uses down for expanded and right for collapsed, and does not open the task detail panel. Collapse state is stored on the task as `subtasks_collapsed`, defaults expanded for new and existing tasks, auto-expands when a new subtask is added, and resets to expanded for recurring-task clones.

### Overdue Page

The Overdue tab groups open overdue tasks by due date. If a task is checked complete, it moves into the Overdue tab's completed section and remains there for 24 hours after completion.

### All Tasks Page

The All Tasks page supports:

- date-range filtering,
- search,
- optional show-completed toggle.

Tasks are grouped by due date. All tasks must have a due date. If the show-completed toggle is enabled, completed tasks appear inline inside their due-date group; the All Tasks page does not use completed accordions. If the date range is a single day, the page behaves like the per-day planner view for that date.

### Schedule Page

The Schedule page shows a month calendar with task counts/status indicators. Tapping a day opens that day in the planner. Returning to Schedule restores the previously viewed calendar month instead of resetting to the current month.

### Archive Page

The Archive page shows completed task groups by completion date. A completed subtask is not shown separately if its parent task is not complete. Fully completed parent/subtask groups appear together under the parent task's completion date.

Archive rows still expose the subtask chevron when visible subtasks exist. Because the archive hides pinning, the chevron appears before the completion checkbox.

### Manage Tags Page

The Manage Tags page lists tags with item counts and supports creating, renaming, deleting/archiving, and filtering tags. Deleting a tag requires confirmation. If active tasks are assigned to the tag, delete archives and hides the tag while preserving history; otherwise the tag can be deleted.

### Task Detail Drawer / Panel

The task detail view supports:

- title,
- due date,
- recurrence,
- notes,
- links,
- attachments,
- pin state,
- subtask collapse state,
- tag,
- subtasks,
- sync/pending/error states where relevant.

On mobile this opens as a drawer. On wider screens it appears as a right-side panel.

## Task Behavior

Tasks support a parent/subtask hierarchy through `parent_id`.

Completion rules:

- A subtask can be completed independently.
- A parent task cannot be completed until all subtasks are complete.
- Completed subtasks remain in the active group until the parent and siblings are complete.
- Completed task groups move into archive/completed views according to their completion date.

Ordering rules:

- Planner daily tabs and the Overdue tab support manual ordering with a drag handle. All Tasks, Archive, Schedule, and Manage Tags do not expose drag reordering.
- Pinned tasks always appear above unpinned tasks.
- Manual order syncs across devices.
- Drag-and-drop uses a handle or long-press on touch devices so scrolling remains reliable.

Search filters the visible list without changing stored order.

## Recurrence

The MVP supports these recurrence types:

- none,
- daily,
- weekly,
- monthly,
- yearly,
- custom repeat every `N` days.

Recurring task rules can end at Eternity or on a selected inclusive end date. The end date cannot be earlier than the task due date. When a recurring task is completed, the app creates or activates the next occurrence based on the recurrence rule only when that next due date is on or before the configured end date. Monthly and yearly recurrences still clamp to the last valid day of the target month before this end-date check is applied. The MVP does not support advanced recurrence exceptions, weekday/month-position rules, or count-based recurrence limits.

## Data Model

SQLite is the canonical server store. The exact schema can evolve during implementation, but the design requires these concepts:

- `tasks`: core task fields, parent relation, due date, completion state, pin state, subtask collapse state, notes, tag reference, recurrence reference, timestamps.
- `tags`: tag name, archived/deleted state, timestamps.
- `links`: task-linked URLs.
- `attachments`: task id, original filename, stored filename/path, MIME type, size, checksum, created/modified timestamps, deleted state.
- `recurrences`: recurrence type, optional inclusive end date, and `interval_days` for custom every-N-days rules.
- `list_orders`: per-list/date manual order positions.
- `devices`: stable device ids and metadata.
- `sessions`: server-side unlock sessions with device id, password fingerprint, created timestamp, last-seen timestamp, and invalidation timestamp.
- `session_events`: optional audit records for unlock attempts and issued sessions.
- `sync_operations`: immutable operation log for idempotent sync and audit/debug.

The PWA stores an offline projection in IndexedDB:

- tasks,
- tags,
- links,
- attachment metadata,
- recurrence settings,
- list order,
- sync cursors,
- local outbox operations,
- local device/session/theme preferences,
- cached attachment file entries where the browser permits.

## Sync Design

Every client edit is first applied locally in IndexedDB and appended to a local outbox. When online, the client pushes pending operations to the API and pulls operations newer than its last sync cursor.

Each operation includes:

- `operation_id`,
- `device_id`,
- `entity_type`,
- `entity_id`,
- changed fields as a map of field name to value plus `modified_at`,
- created-at timestamp,
- deletion marker when needed.

The server accepts operation batches idempotently. It stores every operation and applies them to SQLite using deterministic field-level last-write-wins:

1. Newer field timestamp wins.
2. If timestamps tie, the stable `device_id` is the tie-breaker.
3. Replayed operations are ignored by `operation_id`.

Conflict handling is automatic. The operation log is retained for audit/debug and future recovery tooling, but the MVP does not expose conflict review UI.

## Attachments

Attachments can be standard uploaded files such as images, PDFs, and text files. Metadata syncs through the operation log. Binary file transfer uses attachment upload/download endpoints.

Server behavior:

- Store files in a Docker attachment volume.
- Store metadata in SQLite.
- Enforce configurable size and total storage limits.
- Use checksums to detect duplicate or corrupted upload/download results.

Client behavior:

- Attachment metadata is available offline after sync.
- Files are cached offline after first open/download.
- Users can mark an attachment as `keep offline`.
- Non-`keep offline` cached files may be evicted when browser storage quota is low.
- Pending uploads remain visible with a pending/error state until sync succeeds.

## Backup And Archive

The app has two separate concepts:

- Archive page: in-app completed task history.
- Export backup: system backup for data portability.

The Export Backup action creates a downloadable archive containing a SQLite export and attachment files. MVP restore/import can be documented as a manual Docker-volume restore procedure rather than a full in-app UI.

## UI And Theme

The implementation uses the approved responsive direction:

- Mobile: top app bar, compact day tabs, list-first workflow, slide-over drawers for navigation and task details.
- Tablet/desktop: persistent left navigation, central planner/schedule content, right-side task detail panel.

The visual baseline comes from `docs/design/sample-light.png` and `docs/design/sample-dark.png`: quiet productivity UI, strong typography, generous spacing, soft row/button highlights, subtle borders, and first-class light/dark modes. The app should adapt the design language to the planner and must not copy ChatGPT branding.

Theme behavior:

- Default follows system preference.
- User can override light/dark per device.
- Theme preference is stored locally and does not need server sync in the MVP.

Interaction behavior:

- Rows and controls must be touch-friendly.
- Core actions cannot be hover-only.
- Use icons for pin, checkbox, subtask expand/collapse, drag handle, attachment, close, menu, search, and related controls.
- Offline, pending, and error states should be visible but restrained.

## PWA And Offline Behavior

The PWA should install on supported devices and work without network for core planner usage.

Offline-capable:

- view synced tasks/tags/links/attachment metadata,
- create/edit/reorder/complete tasks,
- manage subtasks,
- update notes, tags, links, recurrence, and pin state,
- queue attachment metadata and file uploads,
- open cached attachments.

In the single-device read-only cached mode, subtask expand/collapse can still change local visibility but is not queued and does not persist after refresh unless the server update succeeds while online.

Network-required:

- first unlock if the current tab has no valid server-backed session,
- downloading uncached attachments,
- uploading pending attachments,
- backup export,
- first-time sync on a new device.

The service worker caches the app shell and static assets. IndexedDB is the source of truth for offline application data on the client.

## Error Handling

The app should fail visibly and recoverably:

- Invalid password shows a clear unlock error.
- Expired idle session redirects to unlock without losing local queued edits.
- Sync failures leave operations in the outbox and show a small pending/error indicator.
- Attachment upload/download failures can be retried.
- Browser storage quota issues should preserve metadata and queued operations first, then evict non-`keep offline` cached files.
- Server storage limit errors should prevent new uploads while leaving existing task edits syncable.

## Testing

Testing should cover:

- shared recurrence/date helpers,
- task completion rules,
- parent/subtask archive visibility,
- manual ordering with pinned-first behavior,
- operation-log idempotency and field-level last-write-wins,
- Express auth and sync endpoints,
- attachment metadata and upload/download paths,
- Vue component tests for planner interactions,
- service worker/offline behavior at a basic level,
- Playwright smoke tests for mobile and desktop layouts.

## Success Criteria

The MVP is complete when:

- Docker Compose can start the app with configured password, SQLite volume, and attachment volume.
- A user can unlock a browser tab and remain unlocked while active; dormant tabs lock after the configured server-side idle timeout.
- The main planner, overdue, all tasks, schedule, archive, and manage-tags flows work.
- Tasks can be created, edited, completed, reordered, pinned, tagged, searched, archived, and made recurring.
- Parent/subtask completion rules match this spec.
- Offline task edits work and sync later.
- Two devices converge to the same state using deterministic last-write-wins sync.
- Attachments upload to the server volume and can be cached after first open or marked keep-offline.
- Light and dark modes follow the provided design samples.
- Backup export downloads the database export and attachments.
- Core automated tests and smoke tests pass.

## Risks And Follow-ups

- Browser storage quotas vary. Attachment caching must stay explicit and conservative.
- Timestamp-based sync depends on device clocks. The MVP accepts this and uses device id tie-breakers; future versions may add server-assigned logical clocks.
- Password sessions with server-side idle locking are suitable for a private local/Tailscale app, not public exposure.
- Advanced recurrence rules beyond inclusive end dates are intentionally deferred.
- Full backup restore UI is deferred.
