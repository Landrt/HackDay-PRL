import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { Tool } from "../types.js";
import { loadConfig } from "../config.js";

export type GemmaToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type GemmaResponse = {
  text?: string;
  toolCalls?: GemmaToolCall[];
};

export type GemmaGenerateOptions = {
  systemPrompt?: string;
  text?: string;
  image?: {
    data: Buffer;
    mimeType: string;
  };
  audio?: {
    data: Buffer;
    mimeType: string;
  };
  tools?: Tool[];
  geminiClient?: any;
  openaiClient?: any;
};

// Index tournants pour round-robin sur les clés
let geminiKeyIndex = 0;
let openrouterKeyIndex = 0;

/**
 * Récupère la liste ordonnée des clés Gemini
 */
function getGeminiKeys(cfg: ReturnType<typeof loadConfig>): string[] {
  const keys: string[] = [];
  if (cfg.GEMINI_API_KEY) keys.push(cfg.GEMINI_API_KEY);
  if (cfg.GEMINI_API_KEYS && cfg.GEMINI_API_KEYS.length > 0) {
    for (const k of cfg.GEMINI_API_KEYS) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

/**
 * Récupère la liste ordonnée des clés OpenRouter
 */
function getOpenRouterKeys(cfg: ReturnType<typeof loadConfig>): string[] {
  const keys: string[] = [];
  if (cfg.OPENROUTER_API_KEY) keys.push(cfg.OPENROUTER_API_KEY);
  if (cfg.OPENROUTER_API_KEYS && cfg.OPENROUTER_API_KEYS.length > 0) {
    for (const k of cfg.OPENROUTER_API_KEYS) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

/**
 * Générateur principal avec bascule automatique (Failover / Round-Robin)
 */
export async function generateWithGemma(
  options: GemmaGenerateOptions,
  customConfig = loadConfig()
): Promise<GemmaResponse> {
  const mode = customConfig.GEMMA_MODE;

  if (mode === "local") {
    return generateLocal(options, customConfig);
  }

  if (mode === "openrouter") {
    return generateOpenRouterWithFailover(options, customConfig);
  }

  if (mode === "api") {
    return generateApiWithFailover(options, customConfig);
  }

  // MODE "auto" : Tente d'abord Gemini API -> si échec/quota/500 -> bascule sur OpenRouter -> puis Local
  try {
    return await generateApiWithFailover(options, customConfig);
  } catch (apiErr: any) {
    console.warn("⚠️ API Gemini indisponible ou quota atteint, bascule automatique sur OpenRouter...", apiErr?.message);
    try {
      return await generateOpenRouterWithFailover(options, customConfig);
    } catch (orErr: any) {
      console.warn("⚠️ OpenRouter indisponible, tentative en mode Local...", orErr?.message);
      return await generateLocal(options, customConfig);
    }
  }
}

/**
 * Appel API Gemini avec rotation et reprise automatique sur clé suivante en cas de quota (429) ou erreur (500/503)
 */
async function generateApiWithFailover(
  options: GemmaGenerateOptions,
  cfg: ReturnType<typeof loadConfig>
): Promise<GemmaResponse> {
  if (options.geminiClient) {
    return executeGeminiCall(options.geminiClient, cfg.GEMMA_MODEL, options);
  }

  const keys = getGeminiKeys(cfg);
  if (keys.length === 0) {
    throw new Error("Aucune clé API Gemini configurée.");
  }

  let lastError: any = null;

  // On essaie les clés disponibles
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(geminiKeyIndex + i) % keys.length];
    try {
      const client = new GoogleGenAI({ apiKey: key });
      const result = await executeGeminiCall(client, cfg.GEMMA_MODEL, options);
      // Succès : on retient cette clé pour les prochains appels
      geminiKeyIndex = (geminiKeyIndex + i) % keys.length;
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Failover Gemini] Clé ${i + 1}/${keys.length} en erreur (${err?.message || err}). Essai de la suivante...`);
    }
  }

  throw lastError || new Error("Toutes les clés Gemini ont échoué.");
}

async function executeGeminiCall(
  ai: any,
  modelName: string,
  options: GemmaGenerateOptions
): Promise<GemmaResponse> {
  const parts: any[] = [];
  if (options.text) parts.push({ text: options.text });

  if (options.image) {
    parts.push({
      inlineData: {
        data: options.image.data.toString("base64"),
        mimeType: options.image.mimeType
      }
    });
  }

  let functionDeclarations: any[] | undefined = undefined;
  if (options.tools && options.tools.length > 0) {
    functionDeclarations = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchemaLight(t.schema)
    }));
  }

  const reqConfig: any = {};
  if (options.systemPrompt) {
    reqConfig.systemInstruction = options.systemPrompt;
  }
  if (functionDeclarations && functionDeclarations.length > 0) {
    reqConfig.tools = [{ functionDeclarations }];
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts }],
    config: Object.keys(reqConfig).length > 0 ? reqConfig : undefined
  });

  const toolCalls: GemmaToolCall[] = [];
  let responseText: string | undefined = undefined;

  if (response.functionCalls && response.functionCalls.length > 0) {
    for (const fc of response.functionCalls) {
      toolCalls.push({
        name: fc.name,
        args: (fc.args as Record<string, unknown>) || {}
      });
    }
  }

  if (response.text) {
    responseText = response.text;
  }

  return {
    text: responseText,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
}

/**
 * Appel OpenRouter avec rotation de clés en cas d'épuisement de crédits (429/402/500)
 */
async function generateOpenRouterWithFailover(
  options: GemmaGenerateOptions,
  cfg: ReturnType<typeof loadConfig>
): Promise<GemmaResponse> {
  if (options.openaiClient) {
    return executeOpenRouterCall(options.openaiClient, cfg.OPENROUTER_MODEL, options);
  }

  const keys = getOpenRouterKeys(cfg);
  if (keys.length === 0) {
    throw new Error("Aucune clé OpenRouter disponible.");
  }

  let lastError: any = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(openrouterKeyIndex + i) % keys.length];
    try {
      const client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: key
      });
      const result = await executeOpenRouterCall(client, cfg.OPENROUTER_MODEL, options);
      openrouterKeyIndex = (openrouterKeyIndex + i) % keys.length;
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Failover OpenRouter] Clé ${i + 1}/${keys.length} en échec : ${err?.message || err}.`);
    }
  }

  throw lastError || new Error("Toutes les clés OpenRouter ont échoué.");
}

async function executeOpenRouterCall(
  openai: any,
  model: string,
  options: GemmaGenerateOptions
): Promise<GemmaResponse> {
  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  const userParts: any[] = [];
  if (options.text) {
    userParts.push({ type: "text", text: options.text });
  }
  if (options.image) {
    userParts.push({
      type: "image_url",
      image_url: {
        url: `data:${options.image.mimeType};base64,${options.image.data.toString("base64")}`
      }
    });
  }

  const finalContent =
    userParts.length === 1 && userParts[0].type === "text"
      ? userParts[0].text
      : userParts;

  messages.push({ role: "user", content: finalContent });

  const toolsPayload = options.tools?.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: {
          date_cible: { type: "string" },
          titre: { type: "string" },
          date_ou_expression: { type: "string" },
          heure: { type: "string" },
          destinataire: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  }));

  const completion = await openai.chat.completions.create({
    model,
    messages,
    tools: toolsPayload && toolsPayload.length > 0 ? toolsPayload : undefined
  });

  const choice = completion.choices[0];
  const toolCalls: GemmaToolCall[] = [];

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === "function") {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }
        toolCalls.push({
          name: tc.function.name,
          args: parsedArgs
        });
      }
    }
  }

  return {
    text: choice?.message?.content || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
}

/**
 * Exécution locale via Ollama / LM Studio (compatible OpenAI API)
 */
async function generateLocal(
  options: GemmaGenerateOptions,
  cfg: ReturnType<typeof loadConfig>
): Promise<GemmaResponse> {
  const openai =
    options.openaiClient ||
    new OpenAI({
      baseURL: cfg.LOCAL_URL,
      apiKey: "local-gemma-no-key"
    });

  const messages: any[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  const userContent: any[] = [];
  if (options.text) {
    userContent.push({ type: "text", text: options.text });
  }

  messages.push({ role: "user", content: userContent.length === 1 ? userContent[0].text : userContent });

  const toolsPayload = options.tools?.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: {
          date_cible: { type: "string" },
          titre: { type: "string" },
          date_ou_expression: { type: "string" },
          heure: { type: "string" },
          destinataire: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  }));

  const completion = await openai.chat.completions.create({
    model: cfg.LOCAL_MODEL,
    messages,
    tools: toolsPayload && toolsPayload.length > 0 ? toolsPayload : undefined
  });

  const choice = completion.choices[0];
  const toolCalls: GemmaToolCall[] = [];

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === "function") {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsedArgs = {};
        }
        toolCalls.push({
          name: tc.function.name,
          args: parsedArgs
        });
      }
    }
  }

  return {
    text: choice?.message?.content || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
}

/**
 * Extraction conforme Google GenAI
 */
function zodToJsonSchemaLight(schema: any): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      date_cible: { type: "STRING", description: "Date ciblée ou mot-clé relatif comme demain" },
      titre: { type: "STRING", description: "Titre du rendez-vous" },
      date_ou_expression: { type: "STRING", description: "Date ou jour du rendez-vous" },
      heure: { type: "STRING", description: "Heure du rendez-vous" },
      destinataire: { type: "STRING", description: "Nom du contact" },
      message: { type: "STRING", description: "Texte du message" }
    }
  };
}
