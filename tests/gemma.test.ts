import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { generateWithGemma } from "../src/core/gemma.js";

describe("Configuration", () => {
  it("charge les valeurs par défaut proprement", () => {
    const cfg = loadConfig({});
    expect(cfg.GEMMA_MODE).toBe("auto");
    expect(cfg.GEMMA_MODEL).toBe("gemini-3.5-flash-lite");
    expect(cfg.ALLOWED_USER_IDS).toEqual([]);
  });

  it("parse la liste blanche des utilisateurs autorisés", () => {
    const cfg = loadConfig({
      ALLOWED_USER_IDS: "12345, 67890, 11111"
    });
    expect(cfg.ALLOWED_USER_IDS).toEqual(["12345", "67890", "11111"]);
  });
});

describe("Client Gemma 4 unifié", () => {
  it("appelle le client API en mode api", async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: "Bonjour, je suis Hands-Free.",
      functionCalls: []
    });
    const fakeGeminiClient = {
      models: {
        generateContent: mockGenerateContent
      }
    };

    const cfg = loadConfig({ GEMMA_MODE: "api", GEMINI_API_KEY: "dummy" });
    const res = await generateWithGemma(
      {
        text: "Bonjour",
        geminiClient: fakeGeminiClient
      },
      cfg
    );

    expect(mockGenerateContent).toHaveBeenCalled();
    expect(res.text).toBe("Bonjour, je suis Hands-Free.");
  });

  it("gère les appels d'outils (function calling) en mode local", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                type: "function",
                function: {
                  name: "agenda_lire",
                  arguments: JSON.stringify({ jour: "demain" })
                }
              }
            ]
          }
        }
      ]
    });
    const fakeOpenaiClient = {
      chat: {
        completions: {
          create: mockCreate
        }
      }
    };

    const cfg = loadConfig({ GEMMA_MODE: "local" });
    const res = await generateWithGemma(
      {
        text: "Qu'est-ce que j'ai demain ?",
        openaiClient: fakeOpenaiClient
      },
      cfg
    );

    expect(mockCreate).toHaveBeenCalled();
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0].name).toBe("agenda_lire");
    expect(res.toolCalls?.[0].args).toEqual({ jour: "demain" });
  });
});
