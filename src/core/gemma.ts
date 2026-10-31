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
  // Permet d'injecter des clients custom (notamment pour les tests et mocks)
  geminiClient?: any;
  openaiClient?: any;
};

/**
 * Client unique pour interroger Gemma 4 soit via l'API Google GenAI,
 * soit en local via Ollama / LM Studio (compatible SDK OpenAI).
 */
export async function generateWithGemma(
  options: GemmaGenerateOptions,
  customConfig = loadConfig()
): Promise<GemmaResponse> {
  const mode = customConfig.GEMMA_MODE;

  if (mode === "local") {
    return generateLocal(options, customConfig);
  } else {
    return generateApi(options, customConfig);
  }
}

/**
 * Exécution via @google/genai (Google AI Studio / Gemini API)
 */
async function generateApi(
  options: GemmaGenerateOptions,
  cfg: ReturnType<typeof loadConfig>
): Promise<GemmaResponse> {
  const ai = options.geminiClient || new GoogleGenAI({ apiKey: cfg.GEMINI_API_KEY });
  const modelName = cfg.GEMMA_MODEL;

  const parts: any[] = [];

  if (options.text) {
    parts.push({ text: options.text });
  }

  if (options.image) {
    parts.push({
      inlineData: {
        data: options.image.data.toString("base64"),
        mimeType: options.image.mimeType
      }
    });
  }

  if (options.audio) {
    parts.push({
      inlineData: {
        data: options.audio.data.toString("base64"),
        mimeType: options.audio.mimeType
      }
    });
  }

  // Conversion simplifiée des outils pour GenAI
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

  // Extraction du texte et des functionCalls retournés par l'API
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
  if (options.image) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${options.image.mimeType};base64,${options.image.data.toString("base64")}`
      }
    });
  }

  // Pour OpenAI local, le contenu utilisateur peut être une string simple s'il n'y a que du texte
  const finalContent =
    userContent.length === 1 && userContent[0].type === "text"
      ? userContent[0].text
      : userContent;

  messages.push({ role: "user", content: finalContent });

  const toolsPayload = options.tools?.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchemaLight(t.schema)
    }
  }));

  const completion = await openai.chat.completions.create({
    model: cfg.LOCAL_MODEL,
    messages,
    tools: toolsPayload && toolsPayload.length > 0 ? toolsPayload : undefined
  });

  const choice = completion.choices[0];
  const toolCalls: GemmaToolCall[] = [];

  if (choice.message.tool_calls) {
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
    text: choice.message.content || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  };
}

/**
 * Extraction minimale de schéma d'arguments Zod vers JSON Schema
 */
function zodToJsonSchemaLight(schema: any): Record<string, unknown> {
  // Structure générique JSON Schema objet
  return {
    type: "object",
    properties: {},
    additionalProperties: true
  };
}
