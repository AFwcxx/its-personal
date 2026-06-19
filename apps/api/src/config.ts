import { z } from "zod";

const envSchema = z.object({
  APP_TITLE: z.string().trim().min(1).default("Its Personal"),
  APP_PASSWORD: z.string().optional(),
  APP_PIN: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{4}$/).optional()),
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

export type AppConfig = Omit<z.infer<typeof envSchema>, "APP_PASSWORD"> & {
  APP_PASSWORD: string;
  AUTH_MODE: "password" | "pin";
};

export function loadConfig(env = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const configuredPassword = parsed.APP_PASSWORD && parsed.APP_PASSWORD.length > 0 ? parsed.APP_PASSWORD : undefined;

  if (configuredPassword) return { ...parsed, APP_PASSWORD: configuredPassword, AUTH_MODE: "password" };
  if (parsed.APP_PIN) return { ...parsed, APP_PASSWORD: "", AUTH_MODE: "pin" };

  return { ...parsed, APP_PASSWORD: "change-me", AUTH_MODE: "password" };
}
