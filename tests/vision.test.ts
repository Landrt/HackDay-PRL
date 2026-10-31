import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWithGemma } from "../src/core/gemma.js";
import { describe as describeImage } from "../src/vision/describe.js";
import { summarize } from "../src/vision/summarize.js";

vi.mock("../src/core/gemma.js", () => ({
  generateWithGemma: vi.fn()
}));

const mockedGenerateWithGemma = vi.mocked(generateWithGemma);

describe("Vision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("demande une description accessible et transmet l'image à Gemma", async () => {
    const image = Buffer.from("image-data");
    mockedGenerateWithGemma.mockResolvedValue({ text: "Une lettre posée sur une table." });

    await expect(describeImage(image, "image/jpeg")).resolves.toBe(
      "Une lettre posée sur une table."
    );

    expect(mockedGenerateWithGemma).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Décris cette image.",
        image: { data: image, mimeType: "image/jpeg" },
        systemPrompt: expect.stringContaining("Lis intégralement tout texte visible et lisible")
      })
    );
    expect(mockedGenerateWithGemma.mock.calls[0]?.[0].systemPrompt).toContain(
      "indique clairement les incertitudes"
    );
  });

  it("résume le texte avec Gemma et ignore une entrée vide", async () => {
    mockedGenerateWithGemma.mockResolvedValue({ text: "Rendez-vous jeudi à 15 h." });

    await expect(summarize("Le rendez-vous chez le dentiste est prévu jeudi à 15 h.")).resolves.toBe(
      "Rendez-vous jeudi à 15 h."
    );
    expect(mockedGenerateWithGemma).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Résume le texte suivant :\n\nLe rendez-vous chez le dentiste est prévu jeudi à 15 h.",
        systemPrompt: expect.stringContaining("N'ajoute aucune information")
      })
    );

    mockedGenerateWithGemma.mockClear();
    await expect(summarize("  ")).resolves.toBe("Je n'ai pas reçu de texte à résumer.");
    expect(mockedGenerateWithGemma).not.toHaveBeenCalled();
  });

  it("renvoie un message compréhensible si Gemma ne fournit pas de texte", async () => {
    mockedGenerateWithGemma.mockResolvedValue({});

    await expect(describeImage(Buffer.from("image-data"), "image/png")).resolves.toBe(
      "Je n'arrive pas à décrire cette image pour le moment."
    );
    await expect(summarize("Un texte à résumer.")).resolves.toBe(
      "Je n'arrive pas à résumer ce texte pour le moment."
    );
  });
});