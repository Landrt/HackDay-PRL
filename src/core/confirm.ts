import { randomUUID } from "node:crypto";
import type { PendingAction } from "../types.js";

export type StoredAction = {
  id: string;
  userId: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  createdAt: number;
  expiresAt: number;
};

export class ConfirmationStore {
  private actions: Map<string, StoredAction> = new Map();
  private readonly defaultTtlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    // 5 minutes de validité par défaut
    this.defaultTtlMs = ttlMs;
  }

  /**
   * Enregistre une action sensible en attente de confirmation
   */
  create(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    summary: string,
    ttlMs: number = this.defaultTtlMs
  ): PendingAction {
    const id = randomUUID();
    const now = Date.now();
    const action: StoredAction = {
      id,
      userId,
      toolName,
      args,
      summary,
      createdAt: now,
      expiresAt: now + ttlMs
    };

    this.actions.set(id, action);
    return { id, summary };
  }

  /**
   * Récupère l'action si elle existe, appartient au bon utilisateur et n'a pas expiré
   */
  get(userId: string, actionId: string): StoredAction | null {
    const action = this.actions.get(actionId);
    if (!action) return null;

    if (action.userId !== userId) {
      return null;
    }

    if (Date.now() > action.expiresAt) {
      this.actions.delete(actionId);
      return null;
    }

    return action;
  }

  /**
   * Récupère la dernière action en attente pour un utilisateur donné (très utile quand l'utilisateur répond juste "oui")
   */
  getLatestForUser(userId: string): StoredAction | null {
    const now = Date.now();
    let latest: StoredAction | null = null;

    for (const [id, action] of this.actions.entries()) {
      if (now > action.expiresAt) {
        this.actions.delete(id);
        continue;
      }
      if (action.userId === userId) {
        if (!latest || action.createdAt > latest.createdAt) {
          latest = action;
        }
      }
    }

    return latest;
  }

  /**
   * Supprime une action après traitement ou expiration
   */
  remove(actionId: string): void {
    this.actions.delete(actionId);
  }

  /**
   * Nettoie les actions expirées
   */
  cleanup(): void {
    const now = Date.now();
    for (const [id, action] of this.actions.entries()) {
      if (now > action.expiresAt) {
        this.actions.delete(id);
      }
    }
  }

  size(): number {
    return this.actions.size;
  }
}

export const confirmationStore = new ConfirmationStore();
