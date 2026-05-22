import { z } from "zod";

const envSchema = z.object({
  APP_TITLE: z.string().trim().min(1).default("Its Personal"),
  APP_PASSWORD: z.string().min(1).default("change-me"),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10_800),
  APP_TIMEZONE: z.string().default("Asia/Kuala_Lumpur"),
  DATABASE_PATH: z.string().default("./data/its-personal.sqlite"),
  ATTACHMENT_DIR: z.string().default("./attachments"),
  MAX_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(52_428_800),
  MAX_TOTAL_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(10_737_418_240),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env = process.env): AppConfig {
  return envSchema.parse(env);
}
