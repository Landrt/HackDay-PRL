import { generateWithGemma } from "../core/gemma.js";

const SUMMARY_PROMPT = `Tu résumes des textes en français simple pour une réponse qui sera lue à voix haute.
Donne les idées essentielles de façon courte et fidèle au texte.
Conserve les noms, dates et actions importants. N'ajoute aucune information qui n'est pas présente.`;

export async function summarize(text: string): Promise<string> {
  if (!text.trim()) {
    return "Je n'ai pas reçu de texte à résumer.";
  }

  const response = await generateWithGemma({
    systemPrompt: SUMMARY_PROMPT,
    text: `Résume le texte suivant :\n\n${text}`
  });

  return response.text?.trim() || "Je n'arrive pas à résumer ce texte pour le moment.";
}