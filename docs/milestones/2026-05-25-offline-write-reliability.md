# Milestone 3A: Offline Write Reliability

Date: 2026-05-25
Status: Not started

## Current Understanding

- The app currently supports read-only cached snapshot fallback when initial planner refresh fails.
- Live write actions can still be triggered while connectivity is unstable because offline state is only detected after some failed refresh paths.
- Repeated taps on a write action can send repeated requests without visible pending/error feedback.
- The server currently generates fresh IDs for create requests, so retried or repeated creates can become duplicate entities.
- This milestone is the smaller reliability step before full multi-device operation-log sync.

## Success Criteria

- Every non-attachment planner write either confirms server persistence or becomes one durable local pending operation.
- Repeated taps, retries, and lost responses do not create duplicate tasks, subtasks, tags, or links.
- Pending local changes survive refresh, app close, connectivity loss, and local session expiry.
- Pending changes sync automatically after app open, unlock, browser `online`, and conservative periodic retry while pending operations exist.
- The first user-initiated offline or unconfirmed write in an offline session shows the app modal message.
- Pending and failed sync states are visible globally and on directly affected task/subtask rows.
- A Playwright offline scenario verifies that one offline task create syncs back as one server task.

## Known Requirements

- Use Dexie/IndexedDB for local projection metadata and the outbox from the start.
- Generate stable opaque prefixed IDs with `nanoid`, matching the codebase's existing ID style.
- Generate both:
  - client entity IDs, such as `task_<id>` or `subtask_<id>`,
  - operation IDs, such as `op_<id>`.
- Send operation IDs in JSON request bodies for current REST planner writes.
- REST endpoints must store processed operation IDs and return the original resulting entity when the same operation ID is replayed.
- REST create endpoints should accept client-provided entity IDs, while preserving server-generated IDs for compatibility when no ID is provided.
- If the app cannot confirm a write reached the server, convert the write into a pending local operation and retry later with the same entity ID and operation ID.
- For user-facing offline queue notification, use a PrimeVue `Dialog`, not browser-native alert/confirm/prompt.
- Dialog copy:
  - Title: `Saved offline`
  - Body: `You're offline or the server could not be reached. This change is pending and will sync automatically when connectivity returns.`
- Show that dialog only once per offline session, then rely on global pending status and row indicators.
- Destructive actions keep their existing confirmation dialog; after confirmation, the saved-offline dialog can appear for the first queued offline write in that session.
- Add a global status indicator in the app shell with counts, such as `Offline`, `3 pending`, and `Sync failed`.
- Use `pi-exclamation-triangle` before the recurrence icon and title on directly affected task/subtask rows.
- Do not mark parent rows pending only because a child row has pending changes.
- Pending indicator states:
  - pending sync: yellow,
  - sync failed and will retry: red.
- Dark mode pending/error indicators should glow enough to fit the existing dark theme.
- Light mode pending/error indicators should use pastel crayon-like colors that fit the paper-like theme.
- Offline-created tasks should appear like normal tasks plus the pending indicator and remain mostly usable.
- Deleting an offline-created pending task can remove its local create operation instead of queueing create plus delete.
- Offline deletes should disappear from normal lists immediately, while preserving recoverability in pending operation state.
- If the same entity field is edited repeatedly offline, compact to the final effective local state.
- If a repeated update introduces no new value, ignore it.
- If offline edits return a field to its original server-synced value and no dependent pending change remains, drop that field update.
- Multiple offline reorders should compact to the final order per affected list/date group.
- Attachment offline handling is out of scope for this milestone.

## Covered Write Paths

- Task create.
- Task detail update.
- Task complete and reopen.
- Task pin and unpin.
- Task subtask-collapse state when it is intended to persist.
- Task reorder.
- Task delete.
- Subtask create.
- Subtask update.
- Subtask complete and reopen.
- Subtask reorder.
- Subtask delete.
- Tag create.
- Tag rename.
- Tag color update.
- Tag archive/delete behavior.
- Link create.
- Link delete.

## Design Constraints

- `navigator.onLine` is only a hint. Write reliability must be based on confirmed server responses and retryable durable operations.
- Do not show modals from background retry failures.
- Do not use service-worker background sync as the only retry mechanism because support and timing are browser-dependent.
- Keep the first milestone focused on reliability and visibility, not multi-device conflict UI.
- Keep pending state restrained and task-focused; do not add a pending-items screen in this milestone.

## Implementation Notes

- Add a small Dexie database for local outbox and sync metadata.
- Persist enough local projection metadata to render pending indicators after reload.
- Store original synced field values needed for effective-change compaction.
- Add server persistence for processed operation IDs, including enough response metadata to replay the original response for duplicate operation IDs.
- Push pending operations before loading a fresh server snapshot after unlock.
- After successful push, refresh/pull server state and clear or mark local operations as synced.
- For Milestone 3A, the existing REST endpoints remain the write surface, but they become idempotent and accept client IDs.
- Milestone 3B should replace or wrap these REST writes with canonical operation-log sync.

## Open Questions

- Exact database schema for processed REST operation IDs and replayed responses.
- Exact periodic retry interval and backoff policy.
- Whether the global status should expose a manual retry action in this milestone.
- Whether pending indicators need tooltips, screen-reader-only text, or both.

## Decisions Made

- Split the work into this reliability milestone and a later full offline sync milestone.
- Use Dexie immediately instead of a temporary localStorage queue.
- Use client-generated entity IDs plus operation IDs.
- Store operation IDs server-side now.
- Operation IDs are sent in JSON bodies.
- Replayed operations return the original resulting entity.
- Offline modal is informational only for now.
- Global status belongs in the app shell and includes counts.
- Pending icons appear only on directly affected task/subtask rows.
- Automatic retry runs on app open, unlock, browser `online`, and conservative periodic retry while pending operations exist.
- Keep automatic deterministic last-write-wins for the later multi-device sync milestone.

## Testing Requirements

- Unit tests for operation compaction, idempotency metadata, and retry classification.
- Planner store/service tests for creating pending operations and clearing them after successful sync.
- Component tests for global status, saved-offline dialog frequency, and row pending/error indicators.
- API tests for client-provided IDs, operation ID replay, and duplicate prevention.
- Playwright test: create a task while offline, verify pending global status and row icon, restore connectivity, and verify exactly one server task exists.
- Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run e2e`.

## Progress Log

- 2026-05-25: Milestone created after investigating silent offline submissions and duplicate creates from repeated taps/retries.

## Next Actions

- Design the Dexie schema and operation envelope.
- Design the server processed-operation table.
- Add failing tests for duplicate create prevention and pending offline create visibility.
- Implement task create first as the vertical slice.
- Extend the same write wrapper to all non-attachment planner writes.
- Add the offline Playwright regression.
