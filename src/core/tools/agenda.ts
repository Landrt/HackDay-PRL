import Database from "better-sqlite3";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Tool, ToolResult } from "../../types.js";
import { config } from "../../config.js";
import fs from "node:fs";
import path from "node:path";

let dbInstance: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) return dbInstance;

  const targetPath = dbPath || path.resolve(process.cwd(), "data", "agenda.sqlite");
  if (!dbPath) {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, starts_at);
  `);

  if (!dbPath) {
    dbInstance = db;
  }
  return db;
}

/**
 * Schémas Zod stricts pour l'agenda
 */
export const agendaLireSchema = z.object({
  date_cible: z
    .string()
    .optional()
    .describe("Date ciblée ou mot-clé comme 'aujourd\\'hui', 'demain', ou une date YYYY-MM-DD")
});

export const agendaAjouterSchema = z.object({
  titre: z.string().min(1).describe("Titre ou description du rendez-vous"),
  date_ou_expression: z
    .string()
    .describe("Date relative ou heure (ex: 'demain à 15h', 'jeudi à 10h', '2026-11-05 14:00')"),
  heure: z.string().optional().describe("Heure explicite si séparée de la date, ex: '15h' ou '15:00'")
});

/**
 * Résolution déterministe des dates en code (anti-hallucination IA)
 */
export function resolveDateString(expr: string, timezone: string = config.TZ, refDate = new Date()): Date {
  const lower = expr.toLowerCase().trim();
  const target = new Date(refDate);

  if (lower.includes("après-demain") || lower.includes("apres-demain")) {
    target.setDate(target.getDate() + 2);
  } else if (lower.includes("demain")) {
    target.setDate(target.getDate() + 1);
  } else if (lower.includes("aujourd'hui") || lower.includes("aujourdhui")) {
    // Reste aujourd'hui
  } else {
    // Vérification jour de la semaine (lundi, mardi, etc.)
    const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const currentDay = target.getDay();
        let diff = i - currentDay;
        if (diff <= 0) diff += 7; // Prochain jour de la semaine
        target.setDate(target.getDate() + diff);
        break;
      }
    }
  }

  // Extraction éventuelle de l'heure (ex: 15h, 15:30, 9h00)
  const timeMatch = lower.match(/(\d{1,2})[h:](\d{2})?|(\d{1,2})\s*h/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1] || timeMatch[3], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    target.setHours(hours, minutes, 0, 0);
  } else {
    // Par défaut, début de journée 09:00 si non spécifié
    target.setHours(9, 0, 0, 0);
  }

  return target;
}

/**
 * Outil 1 : agenda_lire (Lecture seule -> needsConfirmation: false)
 */
export const agendaLireTool: Tool = {
  name: "agenda_lire",
  description: "Consulte les rendez-vous et événements de l'agenda pour un jour donné.",
  schema: agendaLireSchema,
  needsConfirmation: false,
  summarize(args: unknown): string {
    const parsed = agendaLireSchema.safeParse(args);
    const date = parsed.success && parsed.data.date_cible ? parsed.data.date_cible : "aujourd'hui";
    return `Consulter ton agenda pour ${date}.`;
  },
  async run(userId: string, args: unknown): Promise<ToolResult> {
    const parsed = agendaLireSchema.safeParse(args);
    const targetExpr = parsed.success && parsed.data.date_cible ? parsed.data.date_cible : "aujourd'hui";
    const date = resolveDateString(targetExpr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const db = getDb();
    const rows = db
      .prepare(
        "SELECT title, starts_at FROM events WHERE user_id = ? AND starts_at BETWEEN ? AND ? ORDER BY starts_at ASC"
      )
      .all(userId, startOfDay.toISOString(), endOfDay.toISOString()) as { title: string; starts_at: string }[];

    if (rows.length === 0) {
      return {
        ok: true,
        message: `Tu n'as aucun événement prévu pour ${targetExpr}.`,
        data: []
      };
    }

    const details = rows
      .map((r) => {
        const d = new Date(r.starts_at);
        const heure = `${d.getHours().toString().padStart(2, "0")}h${d
          .getMinutes()
          .toString()
          .padStart(2, "0")}`;
        return `${r.title} à ${heure}`;
      })
      .join(", ");

    return {
      ok: true,
      message: `Pour ${targetExpr}, tu as : ${details}.`,
      data: rows
    };
  }
};

/**
 * Outil 2 : agenda_ajouter (Écriture -> needsConfirmation: true)
 */
export const agendaAjouterTool: Tool = {
  name: "agenda_ajouter",
  description: "Ajoute un événement ou un rendez-vous dans l'agenda. Nécessite une confirmation orale.",
  schema: agendaAjouterSchema,
  needsConfirmation: true,
  summarize(args: unknown): string {
    const parsed = agendaAjouterSchema.safeParse(args);
    if (!parsed.success) {
      return "Ajouter un événement dans ton agenda.";
    }
    const { titre, date_ou_expression, heure } = parsed.data;
    const dateStr = heure ? `${date_ou_expression} à ${heure}` : date_ou_expression;
    return `Ajouter "${titre}" à ton agenda pour ${dateStr}.`;
  },
  async run(userId: string, args: unknown): Promise<ToolResult> {
    const parsed = agendaAjouterSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Paramètres de rendez-vous incomplets ou invalides." };
    }

    const { titre, date_ou_expression, heure } = parsed.data;
    const fullExpr = heure ? `${date_ou_expression} ${heure}` : date_ou_expression;
    const resolvedDate = resolveDateString(fullExpr);

    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare("INSERT INTO events (id, user_id, title, starts_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      userId,
      titre,
      resolvedDate.toISOString(),
      now
    );

    const heureFormatee = `${resolvedDate.getHours().toString().padStart(2, "0")}h${resolvedDate
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    return {
      ok: true,
      message: `C'est noté. J'ai ajouté "${titre}" le ${resolvedDate.toLocaleDateString("fr-FR")} à ${heureFormatee}.`,
      data: { id, title: titre, starts_at: resolvedDate.toISOString() }
    };
  }
};
