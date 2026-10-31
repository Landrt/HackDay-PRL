import { describe, it, expect, beforeEach } from "vitest";
import { agendaLireTool, agendaAjouterTool, resolveDateString, getDb } from "../src/core/tools/agenda.js";
import { envoyerMessageTool } from "../src/core/tools/message.js";
import { ToolRegistry } from "../src/core/tools/index.js";
import Database from "better-sqlite3";

describe("Résolution des dates relatives", () => {
  it("résout 'demain à 15h' correctement", () => {
    // 31 octobre -> lendemain = 1er novembre (mois suivant)
    const ref = new Date(2026, 9, 31, 10, 0, 0); // Mois 9 = octobre
    const res = resolveDateString("demain à 15h", "Africa/Douala", ref);
    expect(res.getMonth()).toBe(10); // Novembre
    expect(res.getDate()).toBe(1);
    expect(res.getHours()).toBe(15);
  });

  it("résout 'après-demain' avec heure par défaut", () => {
    const ref = new Date(2026, 9, 31, 10, 0, 0);
    const res = resolveDateString("après-demain", "Africa/Douala", ref);
    expect(res.getMonth()).toBe(10);
    expect(res.getDate()).toBe(2);
    expect(res.getHours()).toBe(9);
  });
});

describe("Outils Agenda SQLite", () => {
  beforeEach(() => {
    // Initialise une base SQLite en mémoire pour isoler les tests
    getDb(":memory:");
  });

  it("ajoute un rendez-vous et le lit ensuite", async () => {
    const userId = "test-user-1";
    // 1. Ajouter
    const addRes = await agendaAjouterTool.run(userId, {
      titre: "Dentiste",
      date_ou_expression: "demain à 15h"
    });
    expect(addRes.ok).toBe(true);
    expect(addRes.message).toContain("Dentiste");

    // 2. Lire
    const readRes = await agendaLireTool.run(userId, { date_cible: "demain" });
    expect(readRes.ok).toBe(true);
    expect(readRes.message).toContain("Dentiste à 15h00");
  });

  it("gère l'absence d'événements proprement", async () => {
    const readRes = await agendaLireTool.run("user-vide", { date_cible: "demain" });
    expect(readRes.ok).toBe(true);
    expect(readRes.message).toContain("Tu n'as aucun événement prévu pour demain.");
  });

  it("nécessite une confirmation pour l'ajout", () => {
    expect(agendaAjouterTool.needsConfirmation).toBe(true);
    expect(agendaLireTool.needsConfirmation).toBe(false);
  });
});

describe("Outil Envoyer Message", () => {
  it("nécessite une confirmation avant envoi", () => {
    expect(envoyerMessageTool.needsConfirmation).toBe(true);
  });

  it("génère un résumé parlable clair", () => {
    const summary = envoyerMessageTool.summarize({
      destinataire: "Marie",
      message: "J'arrive avec 10 minutes de retard"
    });
    expect(summary).toBe('Envoyer à Marie : "J\'arrive avec 10 minutes de retard".');
  });

  it("refuse poliment un contact inconnu", async () => {
    const res = await envoyerMessageTool.run("user-1", {
      destinataire: "Inconnu99",
      message: "Salut"
    });
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Je ne connais pas le contact "Inconnu99"');
  });
});

describe("ToolRegistry", () => {
  it("contient les 3 outils essentiels", () => {
    const registry = new ToolRegistry();
    expect(registry.get("agenda_lire")).toBeDefined();
    expect(registry.get("agenda_ajouter")).toBeDefined();
    expect(registry.get("envoyer_message")).toBeDefined();
  });
});
