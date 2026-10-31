import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmationStore } from "../src/core/confirm.js";
import { HandsFreeAgent } from "../src/core/agent.js";
import { ToolRegistry } from "../src/core/tools/index.js";
import type { Tool } from "../src/types.js";

describe("ConfirmationStore", () => {
  it("enregistre et récupère une action en attente", () => {
    const store = new ConfirmationStore(60000);
    const pending = store.create("user1", "agenda_ajouter", { titre: "Dentiste" }, "Ajouter Dentiste");
    expect(pending.id).toBeDefined();

    const stored = store.get("user1", pending.id);
    expect(stored).not.toBeNull();
    expect(stored?.summary).toBe("Ajouter Dentiste");
  });

  it("isole les utilisateurs", () => {
    const store = new ConfirmationStore(60000);
    const pending = store.create("user1", "agenda_ajouter", {}, "Action user1");
    expect(store.get("user2", pending.id)).toBeNull();
  });

  it("gère l'expiration après TTL", () => {
    const store = new ConfirmationStore(-1); // Déjà expiré
    const pending = store.create("user1", "agenda_ajouter", {}, "Action expirée");
    expect(store.get("user1", pending.id)).toBeNull();
  });
});

describe("HandsFreeAgent", () => {
  let fakeTool: Tool;
  let registry: ToolRegistry;
  let store: ConfirmationStore;
  let agent: HandsFreeAgent;

  beforeEach(() => {
    fakeTool = {
      name: "action_sensible",
      description: "Une action critique",
      schema: {} as any,
      needsConfirmation: true,
      summarize: () => "effectuer l'action critique.",
      run: vi.fn().mockResolvedValue({ ok: true, message: "Action exécutée avec succès !" })
    };

    registry = new ToolRegistry([fakeTool]);
    store = new ConfirmationStore(60000);
    agent = new HandsFreeAgent(registry, store);
  });

  it("demande confirmation orale et ne lance pas l'outil immédiatement", async () => {
    // Simuler que le store a une action créée
    const pending = store.create("user1", "action_sensible", { param: "val" }, "effectuer l'action critique.");

    expect(fakeTool.run).not.toHaveBeenCalled();

    // L'utilisateur dit "non"
    const replyNo = await agent.handle("user1", { text: "non" });
    expect(replyNo.text).toContain("annulée");
    expect(fakeTool.run).not.toHaveBeenCalled();
  });

  it("exécute l'action quand l'utilisateur répond 'oui'", async () => {
    store.create("user1", "action_sensible", { param: "val" }, "effectuer l'action critique.");

    const replyYes = await agent.handle("user1", { text: "oui" });
    expect(fakeTool.run).toHaveBeenCalledTimes(1);
    expect(replyYes.text).toContain("Action exécutée avec succès !");
  });
});
