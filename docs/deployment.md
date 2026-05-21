# Deployment

## Docker Compose

1. Copy `.env.example` to `.env`.
2. Set `APP_PASSWORD` and `SESSION_SECRET`.
   If either value contains `$`, escape each `$` as `$$` because Docker Compose interpolates environment files.
3. Start the app:

```bash
docker compose up -d --build
```

Default binding is `127.0.0.1:3002`, so the app is not exposed publicly.

## Tailscale Serve HTTPS

Use Tailscale Serve to expose the local app over HTTPS inside the tailnet:

```bash
tailscale serve --bg https / http://127.0.0.1:3002
```

HTTPS matters because installed PWA and service-worker behavior requires a secure context outside `localhost`.

## Volumes

- SQLite data: `planner-data`
- Attachments: `planner-attachments`

Keep these volumes backed up. Do not expose this app to the public internet without additional hardening.
