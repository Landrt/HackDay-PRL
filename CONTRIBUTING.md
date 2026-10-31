# Guide de contribution — Hands-Free

Merci de contribuer à **Hands-Free** ! Ce document décrit nos règles de collaboration afin de garder un historique propre, lisible et sécurisé.

---

## 1. Architecture et périmètres

Le code s'articule autour du contrat partagé dans [`src/types.ts`](./src/types.ts).

| Dossier / Fichier | Responsabilité |
| --- | --- |
| `src/types.ts` | **Contrat partagé** — toute modification doit être convenue avec toute l'équipe avant changement. |
| `src/config.ts`, `src/core/` | Cerveau Gemma 4 (bascule API / local), registre d'outils (`zod`), confirmations en attente, agenda SQLite. |
| `src/channels/`, `src/mcp/` | Bot Telegram (`grammY`), liste blanche d'utilisateurs, audio entrant, synthèse vocale (`Piper` + `ffmpeg`), serveur MCP. |
| `src/vision/`, `docs/` | Description d'images accessible, résumé de texte, documentation et retours de tests utilisateurs. |
| `tests/` | Tests unitaires `vitest` associés à chaque module. |

---

## 2. Workflow Git & Pull Requests

1. **Une branche par fonctionnalité** créée depuis `main` :
   - `feat/agenda`, `feat/core-agent`
   - `feat/telegram-voice`, `feat/mcp-server`
   - `feat/vision`, `docs/readme`
2. **Commits petits et fréquents** au format *Conventional Commits* :
   - `feat: add pending confirmation store with expiration`
   - `fix: reject unknown contact alias in envoyer_message`
   - `docs: document local Ollama setup`
   - `test: cover relative date resolution`
   - `chore: configure strict TypeScript setup`
   - Si vous travaillez à deux sur un commit, ajoutez `Co-authored-by: Nom <email>` à la fin du message.
3. **Pull Request obligatoire et revue croisée** :
   - Aucune fusion directe sur `main` sans Pull Request relue par un autre membre de l'équipe (**A relit B**, **B relit C**, **C relit A**).
4. **Avant d'ouvrir une PR**, vérifiez que tout compile et passe les tests :
   ```bash
   npm run typecheck
   npm test
   ```

---

## 3. Règles de sécurité et qualité

- **Zéro secret dans Git** : ne commitez **jamais** de fichier `.env`, de clé `GEMINI_API_KEY`, de `TELEGRAM_BOT_TOKEN` ni de vrais identifiants Telegram (`contacts.json`). Utilisez uniquement `.env.example` avec des valeurs vides ou fictives.
- **Validation stricte** : toute sortie structurée provenant du modèle doit être validée avec `zod`.
- **Confirmation orale obligatoire** : aucune action qui modifie l'agenda ou envoie un message ne doit s'exécuter sans confirmation explicite de l'utilisateur.
