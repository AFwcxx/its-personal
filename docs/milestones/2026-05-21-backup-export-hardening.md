# Milestone 4: Backup Export, Attachment Cache, And Hardening

Date: 2026-05-21
Status: Not started

## Current Understanding

- Milestone 1 documents manual Docker volume backup/restore only.
- Original docs require export backup and richer attachment offline behavior.
- This milestone should complete operational safety and private-network deployment polish after sync exists.

## Known Requirements

- Add authenticated backup export containing SQLite data and attachment files.
- Keep restore as documented manual Docker-volume procedure unless a later requirement adds in-app restore.
- Add attachment offline cache behavior: first-open cache, `keep offline`, retry failed upload/download, preserve metadata under storage pressure.
- Enforce configured per-file and total attachment size limits.
- Improve deployment docs for Tailscale Serve HTTPS, secrets, volumes, and non-public exposure.
- Add stronger e2e/manual acceptance checks for Docker deployment.

## Open Questions

- Backup format: raw SQLite copy, SQLite dump, or archive containing both?
- Should export require re-entering password even with a valid daily session?
- Should total attachment limit be enforced by SQLite metadata sum, filesystem scan, or both?
- Should the app expose a storage usage panel?

## Decisions Made

- No public-internet hardening beyond private-network/Tailscale guidance unless requirements change.
- Do not build full in-app restore UI in this milestone.
- Keep secrets in `.env` and document strong values; do not commit real secrets.

## Progress Log

- 2026-05-21: Milestone created to capture deferred backup/export and operational hardening work.

## Next Actions

- Add API tests for backup export authorization and archive contents.
- Implement `GET /api/backup/export`.
- Add UI action for export backup.
- Add attachment cache tests and browser quota handling policy.
- Expand deployment docs and backup/restore docs with final commands.
- Run `npm test`, `npm run typecheck`, `npm run build`, Docker build/start smoke, and relevant e2e tests.
- Update this file after each meaningful step.
