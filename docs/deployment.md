# Deployment

## Docker Compose

1. Copy `.env.example` to `.env`.
2. Set `APP_PASSWORD` and `SESSION_SECRET`.
   If either value contains `$`, escape each `$` as `$$` because Docker Compose interpolates environment files.
   Optionally set `APP_TITLE`; the default is `Its Personal`.
   Optionally set `APP_THEME` to `dark`, `light`, or `system`; the default is `dark`.
   Optionally set `SESSION_IDLE_TIMEOUT_SECONDS`; the default is `10800` seconds.
3. Start the app:

```bash
docker compose up -d --build
```

Default binding is `127.0.0.1:3009`, so the app is not exposed publicly.

## Tailscale Serve HTTPS

Use Tailscale Serve to expose the local app over HTTPS inside the tailnet:

```bash
tailscale serve --bg https / http://127.0.0.1:3009
```

HTTPS matters because installed PWA and service-worker behavior requires a secure context outside `localhost`.

## Volumes

- SQLite data: `planner-data`
- Attachments: `planner-attachments`

Keep these volumes backed up. Do not expose this app to the public internet without additional hardening.
