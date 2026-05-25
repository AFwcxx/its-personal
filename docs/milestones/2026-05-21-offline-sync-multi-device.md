# Milestone 3B: Offline Edits And Multi-Device Sync

Date: 2026-05-21
Status: Not started

## Current Understanding

- Milestone 1 only supports read-only cached snapshot fallback when offline.
- Original documented goal requires offline task edits and convergence across devices through an operation log.
- Milestone 3A (`2026-05-25-offline-write-reliability.md`) should first harden single-device writes with Dexie outbox storage, idempotent REST writes, pending indicators, and automatic retry.
- This milestone should make the operation log the canonical planner write path after Milestone 3A proves the local outbox and pending-state model.

## Known Requirements

- Use stable per-device `device_id` for attribution and deterministic conflict tie-breaks.
- Client edits should apply locally first, queue in IndexedDB outbox, then sync when online.
- Server should accept operation batches idempotently and store immutable sync operations.
- Pull should return operations newer than client cursor.
- Conflict rule from docs: field-level last-write-wins by modified timestamp, then stable `device_id`.
- Offline supported edits should include task create/edit/reorder/complete, subtasks, notes, tags, links, recurrence, and pin state.
- Sync failures should preserve outbox and show pending/error state.
- Sync operations should become the canonical write path for planner domain writes.
- Existing REST planner endpoints may remain only as compatibility wrappers if they emit the same operations.
- Automatic deterministic last-write-wins remains the conflict policy; no conflict review UI is planned for this milestone.

## Open Questions

- Should server assign a monotonic sequence cursor for all accepted operations?
- How should attachment binary upload integrate with metadata operations and retry state?
- What maximum operation-log retention policy is acceptable for a personal app?
- How much clock skew tolerance is needed before replacing client timestamps with server logical clocks?
- How should Milestone 3A processed-operation records migrate into or coexist with the canonical operation log?

## Decisions Made

- Do not average sync designs: implement documented operation log, not ad hoc timestamp polling.
- Keep conflict review UI out of scope unless tests reveal unrecoverable ambiguity.
- Preserve queued local edits if the idle session expires.
- Push pending local operations before loading a fresh server snapshot after unlock.

## Progress Log

- 2026-05-21: Milestone created to capture deferred full offline/multi-device requirement.

## Next Actions

- Add shared operation types/schemas and tests for field winner behavior.
- Add API `sync_operations` schema, repositories, and `/api/sync/push` + `/api/sync/pull`.
- Add IndexedDB stores for projection, outbox, sync cursors, settings, and cached attachment metadata.
- Add pending/error UI states on task rows and task detail.
- Add two-device convergence tests and offline e2e smoke test.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`.
- Update this file after each meaningful step.
