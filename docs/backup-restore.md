# Backup And Restore

Milestone 1 uses manual Docker volume backup/restore.

## Backup

Stop the container before a filesystem-level backup:

```bash
docker compose down
docker run --rm -v its-personal_planner-data:/data -v "$PWD":/backup busybox tar czf /backup/planner-data.tgz -C /data .
docker run --rm -v its-personal_planner-attachments:/attachments -v "$PWD":/backup busybox tar czf /backup/planner-attachments.tgz -C /attachments .
docker compose up -d
```

## Restore

Stop the app, restore both archives into their volumes, then start it again:

```bash
docker compose down
docker run --rm -v its-personal_planner-data:/data -v "$PWD":/backup busybox sh -c "rm -rf /data/* && tar xzf /backup/planner-data.tgz -C /data"
docker run --rm -v its-personal_planner-attachments:/attachments -v "$PWD":/backup busybox sh -c "rm -rf /attachments/* && tar xzf /backup/planner-attachments.tgz -C /attachments"
docker compose up -d
```

Restore should use matching app versions until migrations are formalized.
