import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import type { Attachment } from "@its-personal/shared";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/connection.js";
import { getAttachment, insertAttachment, softDelete } from "../db/repositories.js";
import type { PlannerChanges } from "../plannerChanges.js";

export function attachmentsRouter(config: AppConfig, db: Db, changes?: PlannerChanges): Router {
  fs.mkdirSync(config.ATTACHMENT_DIR, { recursive: true });
  const upload = multer({ dest: config.ATTACHMENT_DIR, limits: { fileSize: config.MAX_ATTACHMENT_BYTES } });
  const router = Router();

  router.post("/", upload.single("file"), (req, res) => {
    if (!req.file || typeof req.body.taskId !== "string") {
      res.status(400).json({ error: "file and taskId are required" });
      return;
    }
    const checksum = crypto.createHash("sha256").update(fs.readFileSync(req.file.path)).digest("hex");
    const storedName = `${req.file.filename}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    fs.renameSync(req.file.path, path.join(config.ATTACHMENT_DIR, storedName));
    const attachment: Attachment = {
      id: nanoid(),
      taskId: req.body.taskId,
      originalName: req.file.originalname,
      storedName,
      mimeType: req.file.mimetype,
      size: req.file.size,
      checksum,
      createdAt: new Date().toISOString(),
      deletedAt: null
    };
    const created = insertAttachment(db, attachment);
    changes?.bump();
    res.status(201).json(created);
  });

  router.get("/:id", (req, res) => {
    const attachment = getAttachment(db, req.params.id);
    if (!attachment || attachment.deletedAt) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    res.type(attachment.mimeType);
    res.download(path.join(config.ATTACHMENT_DIR, attachment.storedName), attachment.originalName);
  });

  router.delete("/:id", (req, res) => {
    softDelete(db, "attachments", req.params.id, new Date().toISOString());
    changes?.bump();
    res.status(204).end();
  });

  return router;
}
