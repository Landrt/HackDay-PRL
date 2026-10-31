import { z } from "zod";

const configSchema = z.object({
  GEMMA_MODE: z.enum(["api", "local", "openrouter", "auto"]).default("auto"),
  GEMINI_API_KEY: z.string().optional().default(""),
  // Supporte plusieurs clés séparées par des virgules pour Gemini
  GEMINI_API_KEYS: z
    .string()
    .optional()
    .default("")
    .transform((val) => (val ? val.split(",").map((k) => k.trim()).filter(Boolean) : [])),
  GEMMA_MODEL: z.string().default("gemini-3.5-flash-lite"),
  // Supporte plusieurs clés OpenRouter séparées par des virgules pour le round-robin / fallback
  OPENROUTER_API_KEYS: z
    .string()
    .optional()
    .default("")
    .transform((val) => (val ? val.split(",").map((k) => k.trim()).filter(Boolean) : [])),
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().default("google/gemma-2-9b-it:free"),
  LOCAL_URL: z.string().default("http://localhost:11434/v1"),
  LOCAL_MODEL: z.string().default("gemma-4-e4b"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  ALLOWED_USER_IDS: z
    .string()
    .optional()
    .default("")
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : []
    ),
  TZ: z.string().default("Africa/Douala"),
  PIPER_BIN: z.string().default("piper"),
  PIPER_VOICE: z.string().optional().default("")
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Configuration invalide : ${errorMessages}`);
  }

  const config = parsed.data;

  // En mode api, GEMINI_API_KEY est fortement attendue (sauf en environnement de test/mock)
  if (config.GEMMA_MODE === "api" && !config.GEMINI_API_KEY && process.env.NODE_ENV !== "test") {
    console.warn("⚠️ Attention : GEMMA_MODE est 'api' mais GEMINI_API_KEY est vide.");
  }

  return config;
}

export const config = loadConfig();
