import type { Agent, Input, Reply, Tool } from "../types.js";
import { toolRegistry, ToolRegistry } from "./tools/index.js";
import { confirmationStore, ConfirmationStore } from "./confirm.js";
import { generateWithGemma } from "./gemma.js";
import { describeImage, summarizeText } from "../vision/index.js";

const SYSTEM_PROMPT = `Tu es Hands-Free, un assistant vocal pour les personnes aveugles ou ne pouvant pas utiliser leurs mains.
Tu réponds toujours de manière concise, polie, claire et directement formulée en français oral.
Ne formule jamais de suppositions sur les dates ou les rendez-vous : fais appel aux outils fournis (agenda_lire, agenda_ajouter, envoyer_message).
Pour une action qui modifie l'agenda ou envoie un message, utilise l'outil correspondant.
Si l'utilisateur pose une question générale, réponds-lui poliment et brièvement.`;

export class HandsFreeAgent implements Agent {
  private registry: ToolRegistry;
  private confirmStore: ConfirmationStore;

  constructor(registry = toolRegistry, store = confirmationStore) {
    this.registry = registry;
    this.confirmStore = store;
  }

  /**
   * Traitement d'un message entrant (texte, image, note vocale)
   */
  async handle(userId: string, input: Input): Promise<Reply> {
    const rawText = input.text?.trim() || "";

    // 1. Détection de réponse de confirmation orale ("oui", "non", "annule") si une action est en attente
    const pending = this.confirmStore.getLatestForUser(userId);
    if (pending && rawText) {
      const lower = rawText.toLowerCase().replace(/[.,!?;:]/g, "").trim();
      const isYes = lower === "oui" || lower === "ouais" || lower === "confirme" || lower === "daccord" || lower === "d'accord";
      const isNo = lower === "non" || lower === "annule" || lower === "pas du tout" || lower === "refuse";

      if (isYes) {
        return this.confirm(userId, pending.id, true);
      }
      if (isNo) {
        return this.confirm(userId, pending.id, false);
      }
    }

    // 2. Gestion vision : photo transmise
    if (input.image && input.mimeType) {
      try {
        const description = await describeImage(input.image, input.mimeType);
        return { text: description };
      } catch (err) {
        return {
          text: "Je n'ai pas pu analyser clairement la photo. Peux-tu la reprendre avec un meilleur éclairage ?"
        };
      }
    }

    // 3. Appel de Gemma 4 pour décider de l'action ou répondre
    const tools = this.registry.getAll();
    try {
      const gemmaRes = await generateWithGemma({
        systemPrompt: SYSTEM_PROMPT,
        text: rawText,
        tools
      });

      // Si Gemma a décidé d'appeler un outil
      if (gemmaRes.toolCalls && gemmaRes.toolCalls.length > 0) {
        const call = gemmaRes.toolCalls[0];
        const tool = this.registry.get(call.name);

        if (!tool) {
          return { text: "Désolé, je ne dispose pas de cet outil pour le moment." };
        }

        // Action nécessitant confirmation orale ?
        if (tool.needsConfirmation) {
          const summary = tool.summarize(call.args);
          const pendingAction = this.confirmStore.create(userId, tool.name, call.args, summary);
          return {
            text: `Je vais ${summary.toLowerCase()} Tu confirmes ?`,
            pending: pendingAction
          };
        }

        // Action de lecture immédiate
        const result = await tool.run(userId, call.args);
        return { text: result.message };
      }

      // Réponse textuelle directe de Gemma
      if (gemmaRes.text) {
        return { text: gemmaRes.text };
      }

      return { text: "Je n'ai pas bien compris ta demande. Peux-tu reformuler ?" };
    } catch (err) {
      return {
        text: "Une erreur est survenue lors de l'analyse de ta demande. Peux-tu répéter ?"
      };
    }
  }

  /**
   * Confirmation explicite d'une action en attente (vocale ou bouton)
   */
  async confirm(userId: string, actionId: string, accepted: boolean): Promise<Reply> {
    const action = this.confirmStore.get(userId, actionId);

    if (!action) {
      return {
        text: "Cette action n'est plus en attente ou a expiré."
      };
    }

    // Nettoyage de l'action stockée
    this.confirmStore.remove(actionId);

    if (!accepted) {
      return {
        text: "D'accord, l'action a été annulée."
      };
    }

    // Exécution de l'action confirmée
    const tool = this.registry.get(action.toolName);
    if (!tool) {
      return {
        text: "Impossible d'exécuter l'action demandée : outil introuvable."
      };
    }

    try {
      const result = await tool.run(userId, action.args);
      return { text: result.message };
    } catch (err) {
      return {
        text: "Une erreur est survenue lors de l'exécution de l'action."
      };
    }
  }
}

export const agent = new HandsFreeAgent();
