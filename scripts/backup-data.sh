#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_DIR="$(pwd -P)"
BACKUP_ROOT="$PROJECT_DIR/backups"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

if [[ "$CURRENT_DIR" != "$PROJECT_DIR" ]]; then
  echo "Error: run this script from the project root:"
  echo "  $PROJECT_DIR"
  echo
  echo "Current directory:"
  echo "  $CURRENT_DIR"
  exit 1
fi

if [[ ! -f "$PROJECT_DIR/docker-compose.yml" ]] || [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "Error: this does not look like the its-personal project root."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

restart_app() {
  docker compose up -d
}

trap restart_app EXIT

docker compose down

docker run --rm \
  -v its-personal_planner-data:/data \
  -v "$BACKUP_DIR":/backup \
  busybox tar czf /backup/planner-data.tgz -C /data .

docker run --rm \
  -v its-personal_planner-attachments:/attachments \
  -v "$BACKUP_DIR":/backup \
  busybox tar czf /backup/planner-attachments.tgz -C /attachments .

trap - EXIT
restart_app

echo
echo "Backup completed successfully."
echo "Backup stored at:"
echo "  $BACKUP_DIR"
