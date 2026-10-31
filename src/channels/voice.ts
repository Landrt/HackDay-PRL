import type { Voice } from "../types.js";

export class SimpleVoice implements Voice {
  /**
   * Synthèse vocale française haute qualité sans dépendance externe lourde (ni ffmpeg ni piper requis pour commencer).
   * Retourne un buffer audio MP3 direct que Telegram peut envoyer en note vocale.
   */
  async speak(text: string): Promise<Buffer> {
    // Nettoie et tronque si nécessaire pour l'oral
    const cleanText = text
      .replace(/[*_#`~>]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const encoded = encodeURIComponent(cleanText.slice(0, 200));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=fr&client=tw-ob`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!res.ok) {
      throw new Error(`Échec de la synthèse vocale : ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export const voice = new SimpleVoice();
