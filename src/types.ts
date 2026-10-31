import type { ZodTypeAny } from "zod";

export type Input = {
  text?: string;
  image?: Buffer; // photo envoyée par l'utilisateur
  audio?: Buffer; // note vocale
  mimeType?: string;
};

export type PendingAction = {
  id: string;
  summary: string; // phrase prête à être dite à voix haute
};

export type Reply = {
  text: string;
  pending?: PendingAction; // présent si une confirmation est requise
};

export interface Agent {
  handle(userId: string, input: Input): Promise<Reply>;
  confirm(userId: string, actionId: string, accepted: boolean): Promise<Reply>;
}

export interface Voice {
  /** Transforme une réponse texte en note vocale prête à envoyer. */
  speak(text: string): Promise<Buffer>;
}

export type ToolResult = { ok: boolean; message: string; data?: unknown };

export interface Tool {
  name: string;
  description: string; // en français, vue par le modèle
  schema: ZodTypeAny; // paramètres
  needsConfirmation: boolean;
  /** Phrase parlable décrivant l'action avant exécution. */
  summarize(args: unknown): string;
  run(userId: string, args: unknown): Promise<ToolResult>;
}

export interface Vision {
  describe(image: Buffer, mimeType: string): Promise<string>;
  summarize(text: string): Promise<string>;
}
