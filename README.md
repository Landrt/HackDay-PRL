# Hands-Free

> **« AI belongs to everyone »** — Hack Day Hacktoberfest 2026

**Hands-Free** est un assistant vocal open source, propulsé par **Gemma 4**, conçu pour aider les personnes aveugles, malvoyantes ou ne pouvant pas utiliser leurs bras et leurs mains à gérer leurs tâches numériques du quotidien uniquement à la voix depuis **Telegram** (et extensible vers des agents de code via **MCP**).

> **Positionnement** : Hands-Free **complète** les lecteurs d'écran et outils d'accessibilité existants ; il ne les remplace pas. Il fournit des raccourcis vocaux rapides, gratuits et exécutables 100 % en local.

---

## Boucle principale

```text
Note vocale → Gemma 4 → Choix d'un outil → Confirmation orale → Exécution → Réponse parlée
```

**Sécurité & confirmation orale systématique** : une personne qui ne voit pas l'écran ne peut pas relire un message ou un événement avant validation. Toute action qui écrit ou envoie est mise en attente, relue à voix haute (*« Je vais envoyer à Marie : "j'arrive en retard". Je confirme ? »*) et n'est exécutée qu'après un **« oui »** explicite.

---

## Démarrage rapide

```bash
git clone https://github.com/Landrt/HackDay-PRL.git
cd HackDay-PRL && npm install
cp .env.example .env
```

Renseignez ensuite vos variables dans `.env` (voir `.env.example`), puis lancez les vérifications :

```bash
npm run typecheck
npm test
```

---

## Architecture du dépôt

```text
.
├── src/
│   ├── types.ts          # Contrat d'interfaces partagé entre les modules
│   ├── config.ts         # Lecture et validation des variables d'environnement
│   ├── core/             # Cerveau : Gemma 4 (API / Local), boucle agent, confirmations, outils
│   ├── channels/         # Bot Telegram (grammY) et pipeline vocal (Piper TTS / ffmpeg)
│   ├── vision/           # Description d'images accessible et résumé de texte
│   └── mcp/              # Serveur Model Context Protocol (bonus)
├── tests/                # Tests unitaires et d'intégration (Vitest)
└── docs/                 # Schémas, captures et retours de tests utilisateurs
```

---

## Gemma 4 dans le projet

Hands-Free s'appuie sur **Gemma 4** via une interface unique (`GEMMA_MODE=api|local`) :
- **Mode API (`@google/genai`)** : développement rapide via Google AI Studio (`gemma-4-31b-it`).
- **Mode Local (`openai` SDK compatible Ollama / LM Studio)** : exécution locale confidentielle sans envoi de données vers le cloud.

*(Documentation détaillée des modèles, limites connues et retours utilisateurs en cours de rédaction pendant le Hack Day.)*

---

## Contribuer

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](./CONTRIBUTING.md) pour découvrir le découpage du projet, les conventions Git et nos issues étiquetées `good first issue` pour le Hacktoberfest.

## Licence

Distribué sous licence [MIT](./LICENSE).
