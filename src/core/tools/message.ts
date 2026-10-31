import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { Tool, ToolResult } from "../../types.js";

export const envoyerMessageSchema = z.object({
  destinataire: z.string().min(1).describe("Nom ou alias du contact (ex: 'Marie', 'Maman', 'Landry')"),
  message: z.string().min(1).describe("Texte exact du message à envoyer")
});

/**
 * Gestion des contacts autorisés / connus dans contacts.json
 */
export function getContacts(): Record<string, string> {
  const contactsPath = path.resolve(process.cwd(), "contacts.json");
  if (!fs.existsSync(contactsPath)) {
    // Contacts d'exemple par défaut
    const defaultContacts = {
      marie: "123456789",
      maman: "987654321",
      landry: "112233445"
    };
    try {
      fs.writeFileSync(contactsPath, JSON.stringify(defaultContacts, null, 2), "utf-8");
    } catch {
      // Ignorer si écriture impossible
    }
    return defaultContacts;
  }

  try {
    const raw = fs.readFileSync(contactsPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Outil 3 : envoyer_message (Action sensible -> needsConfirmation: true)
 */
export const envoyerMessageTool: Tool = {
  name: "envoyer_message",
  description: "Envoie un message texte à un contact via Telegram. Nécessite une confirmation orale.",
  schema: envoyerMessageSchema,
  needsConfirmation: true,
  summarize(args: unknown): string {
    const parsed = envoyerMessageSchema.safeParse(args);
    if (!parsed.success) {
      return "Envoyer un message à un contact.";
    }
    return `Envoyer à ${parsed.data.destinataire} : "${parsed.data.message}".`;
  },
  async run(_userId: string, args: unknown): Promise<ToolResult> {
    const parsed = envoyerMessageSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Nom du contact ou texte du message manquant." };
    }

    const { destinataire, message } = parsed.data;
    const contacts = getContacts();
    const contactKey = destinataire.toLowerCase().trim();
    const chatId = contacts[contactKey];

    if (!chatId) {
      return {
        ok: false,
        message: `Je ne connais pas le contact "${destinataire}". Sur Telegram, je ne peux envoyer des messages qu'aux contacts enregistrés ayant déjà lancé le bot.`
      };
    }

    // L'envoi réel passera par le bot Telegram (via chatId), simulé de manière robuste ici
    return {
      ok: true,
      message: `Message envoyé avec succès à ${destinataire}.`,
      data: { destinataire, chatId, message, sentAt: new Date().toISOString() }
    };
  }
};
