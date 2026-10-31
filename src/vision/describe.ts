import { generateWithGemma } from "../core/gemma.js";

const DESCRIPTION_PROMPT = `Tu décris cette image pour une personne aveugle ou malvoyante, en français.
Commence par dire en une phrase ce que l'image montre, puis décris les éléments dans un ordre logique.
Lis intégralement tout texte visible et lisible, en conservant les nombres, noms et détails utiles.
Ne présente aucune supposition comme un fait : indique clairement les incertitudes.
Si l'image ou une partie du texte est floue ou illisible, signale-le sans deviner.
Utilise des phrases naturelles, concrètes et faciles à écouter.`;

export async function describe(image: Buffer, mimeType: string): Promise<string> {
  const response = await generateWithGemma({
    systemPrompt: DESCRIPTION_PROMPT,
    text: "Décris cette image.",
    image: { data: image, mimeType }
  });

  return response.text?.trim() || "Je n'arrive pas à décrire cette image pour le moment.";
}