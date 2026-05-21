# Milestone 1: Self-Hosted Single-Device Planner

Date: 2026-05-21

## Current Understanding

- This repository currently contains project documentation and design artifacts for a self-hosted personal planner/todo app.
- The documented target is a Vue 3 PWA, Express API, SQLite canonical store, Docker Compose deployment, and private access through local networking or Tailscale.
- Milestone 1 implements the documented planner domain and screens for a single user/device first.
- Multi-device offline operation-log convergence remains a documented future requirement, but is not part of this milestone.

## Known Requirements

- Daily password unlock using server-configured password and signed session token.
- Full task model for this milestone: tasks, subtasks, due dates, completion, pinning, manual order, notes, recurrence, tags, links, and basic attachments.
- Screens: Planner, All Tasks, Schedule, Archive, Manage Tags, Unlock, and task detail drawer/panel.
- Offline milestone behavior: installable PWA shell and read-only cached planner projection. Edits require server connectivity.
- Docker Compose deployment with SQLite and attachment volumes.
- Tailscale access should use Tailscale Serve HTTPS with the Compose service bound locally.
- Backup/restore for this milestone is documentation-only through Docker volumes.

## Open Questions

- None blocking for Milestone 1.
- Future milestone must decide exact multi-device sync and conflict behavior before implementing operation-log convergence.

## Decisions Made

- Use the existing docs as source of truth and treat `docs/design/gui.*` as the mockup path despite the spec typo mentioning `docs/plan/gui.*`.
- Build a single-device first app rather than the full operation-log sync MVP.
- Include all documented screens in Milestone 1.
- Include basic attachment upload/download/delete in Milestone 1.
- Defer export-backup API/UI; document manual Docker volume backup/restore instead.
- Use Tailscale Serve HTTPS for secure PWA access.

## Progress Log

- 2026-05-21: Inspected repository, `AGENTS.md`, all files under `docs/`, design PNGs, and Excalidraw metadata.
- 2026-05-21: Gathered requirements and locked milestone decisions with the user.
- 2026-05-21: Created this milestone document before implementation.
- 2026-05-21: Scaffolded npm workspace, package configs, TypeScript base config, environment example, and ignore rules.
- 2026-05-21: Added shared domain helpers/tests for dates, recurrence, task rules, validation, and deterministic field choice.
- 2026-05-21: Added Express API, SQLite schema/repositories, daily unlock auth, planner CRUD, links/tags, and attachment upload/download/delete.
- 2026-05-21: Added Vue PWA shell, routes, session/planner stores, planner/all/schedule/archive/tags screens, task detail panel, theme/layout CSS, and read-only cached snapshot behavior.
- 2026-05-21: Added Docker Compose, Dockerfile, Tailscale Serve deployment docs, manual backup/restore docs, and a Playwright smoke placeholder.
- 2026-05-21: Installed dependencies and generated `package-lock.json`.
- 2026-05-21: Verified `npm test`, `npm run typecheck`, and `npm run build` pass.
- 2026-05-21: Verified `docker compose up -d --build` starts and `GET /api/health` returns `{"ok":true}` on `127.0.0.1:3000`.
- 2026-05-21: Installed Playwright Chromium and verified `npm run e2e` passes for desktop and mobile smoke projects.
- 2026-05-21: Changed Docker Compose published address to `127.0.0.1:3002` while keeping app container port `3000`.
- 2026-05-21: Recreated Compose container and verified `GET http://127.0.0.1:3002/api/health` returns `{"ok":true}`.

## Next Actions

- Manual browser review at `http://127.0.0.1:3002/`.
- Configure real `.env` secrets before personal use.
- Continue with `2026-05-21-planner-ux-completeness.md`.
