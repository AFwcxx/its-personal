# It's Personal

A private, self-hosted personal planner for tasks, schedules, tags, links, and attachments.

This app is built for personal or household use on a trusted private network. It is not designed to be exposed directly to the public internet.

## Features

- Planner, schedule, all-tasks, archive, and tag-management views
- Single shared app password with server-side idle session locking
- SQLite storage
- File attachments with configurable per-file size limits
- Docker Compose deployment with persistent volumes
- PWA-friendly web frontend

## Security Model

This application is intended to be reachable through a VPN, tailnet, or another private network layer such as Tailscale, WireGuard, or a private reverse proxy.

Do not publish this app directly to the public internet unless you add additional hardening yourself. The current app uses a single shared password, bearer-token sessions, and private-network assumptions. It does not include public-internet protections such as account management, MFA, rate limiting, abuse monitoring, CSRF hardening, or a full production security review.

Recommended baseline:

- Keep the Docker port bound to `127.0.0.1` unless you know exactly why you need another bind address.
- Access it through a VPN or tailnet instead of opening firewall ports to the internet.
- Use a strong `APP_PASSWORD`.
- Use a long random `SESSION_SECRET`.
- Keep `SESSION_IDLE_TIMEOUT_SECONDS` short enough for your device risk. The default is 3 hours.
- Keep `.env`, SQLite data, and attachment backups private.
- Put HTTPS in front of the app when using it as an installed PWA outside `localhost`.
- Keep the host system, Docker, and this repository updated.

## Quick Start With Docker Compose

Requirements:

- Docker
- Docker Compose

Clone the repository:

```bash
git clone <your-repo-url>
cd its-personal
```

Create your environment file:

```bash
cp .env.example .env
```

Edit `.env` and set at least these values:

```dotenv
APP_PASSWORD=use-a-strong-password
SESSION_SECRET=replace-with-a-long-random-secret
SESSION_IDLE_TIMEOUT_SECONDS=10800
APP_TIMEZONE=Asia/Kuala_Lumpur
PUBLISHED_HOST=127.0.0.1
PUBLISHED_PORT=3009
```

If a value contains `$`, escape each `$` as `$$` because Docker Compose interpolates environment files.

Start the app:

```bash
docker compose up -d --build
```

Open:

```text
http://127.0.0.1:3009
```

Check health:

```bash
curl http://127.0.0.1:3009/api/health
```

Expected response:

```json
{"ok":true}
```

## Private Network Access

The default Compose binding is:

```dotenv
PUBLISHED_HOST=127.0.0.1
PUBLISHED_PORT=3009
```

That means the app is only reachable from the host itself. To access it from another device, prefer a private network layer.

For example, with Tailscale Serve:

```bash
tailscale serve --bg https / http://127.0.0.1:3009
```

This exposes the app over HTTPS inside your tailnet while keeping the Docker service bound locally. HTTPS is also important for installed PWA and service-worker behavior outside `localhost`.

If you need direct access from other devices on a trusted LAN or VPN, you can publish the Docker port on all host interfaces:

```dotenv
PUBLISHED_HOST=0.0.0.0
PUBLISHED_PORT=3009
```

Only use this on a trusted private network. `0.0.0.0` makes the app reachable on every network interface on the host, so confirm your firewall, router, VPN, and cloud security-group rules do not expose the port to the public internet.

If you bind `PUBLISHED_HOST` to a LAN or VPN interface, make sure that interface is not exposed to the public internet.

## Installing As A PWA

The app can be installed from a supported browser on a laptop, desktop, tablet, or phone. Use `http://127.0.0.1:3009` only on the same machine that runs the app. For another device, open the HTTPS address provided by your private network layer, such as Tailscale Serve.

In Google Chrome on desktop Linux, including Fedora GNOME:

1. Open the app URL in Chrome.
2. Click the install icon in the address bar.
3. If there is no install icon, open the Chrome menu and choose **Cast, save, and share** > **Install page as app**.
4. Confirm the install dialog.

After installation, launch it like a normal desktop app from the GNOME app grid or desktop launcher. On Fedora GNOME, press `Super`, search for `It's Personal`, and optionally pin it to the dash.

On Android Chrome:

1. Open the app URL in Chrome.
2. Open the Chrome menu.
3. Choose **Install app** or **Add to Home screen**.
4. Confirm the prompt.

On iPhone or iPad Safari:

1. Open the app URL in Safari.
2. Tap the share button.
3. Choose **Add to Home Screen**.
4. Confirm the prompt.

## Configuration

The app reads configuration from environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_TITLE` | `Its Personal` | Browser, installed app, and manifest name. |
| `APP_PASSWORD` | `change-me` | Password used to unlock the app. Change this. |
| `SESSION_SECRET` | `dev-session-secret-change-me` | Secret used to sign sessions. Use a long random value. |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `10800` | Server-side idle timeout for unlocked browser tabs. The default is 3 hours. |
| `APP_TIMEZONE` | `Asia/Kuala_Lumpur` | Local timezone used by the app for planner dates. Docker also maps this value to `TZ`. |
| `DATABASE_PATH` | `/data/its-personal.sqlite` in Docker | SQLite database path. |
| `ATTACHMENT_DIR` | `/attachments` in Docker | Directory for uploaded files. |
| `MAX_ATTACHMENT_BYTES` | `52428800` | Maximum size for one attachment. |
| `MAX_TOTAL_ATTACHMENT_BYTES` | `10737418240` | Intended total attachment storage limit. |
| `HOST` | `0.0.0.0` in Docker | Address the app listens on inside the container. |
| `PORT` | `3000` in Docker | Port the app listens on inside the container. |
| `PUBLISHED_HOST` | `127.0.0.1` | Host address Docker publishes to. |
| `PUBLISHED_PORT` | `3009` | Host port Docker publishes. |

## Data Storage

Docker Compose creates two persistent volumes:

- `planner-data`: SQLite database
- `planner-attachments`: uploaded attachments

Back up both volumes together. See [docs/backup-restore.md](docs/backup-restore.md) for the exact backup and restore commands.

## Updating

From the repository directory:

```bash
git pull
docker compose up -d --build
```

Check logs if the app does not start:

```bash
docker compose logs -f
```

## Local Development

Requirements:

- Node.js 22
- npm

Install dependencies:

```bash
npm install
```

Run the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

## Project Layout

```text
apps/api          Express API, auth, SQLite access, attachments
apps/web          Vue 3 frontend
packages/shared   Shared schemas, task rules, recurrence, sync types
docs              Deployment, backup, design, and milestone notes
```

## More Deployment Notes

- [docs/deployment.md](docs/deployment.md)
- [docs/backup-restore.md](docs/backup-restore.md)

## License

No license file is currently included. Add one before accepting public contributions or relying on open-source redistribution terms.
