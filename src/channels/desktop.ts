import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { agent } from "../core/agent.js";

const PORT = 3000;

export function startDesktopServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Page d'accueil Desktop
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const htmlPath = path.resolve(process.cwd(), "public", "index.html");
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(htmlPath));
        return;
      }
    }

    // 2. API Agent (Voice & Text)
    if (req.method === "POST" && req.url === "/api/agent") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { userId, text } = JSON.parse(body || "{}");
          const reply = await agent.handle(userId || "desktop-user", { text });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(reply));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: "Erreur serveur", error: err.message }));
        }
      });
      return;
    }

    // 3. API Confirm (Confirmation orale ou bouton)
    if (req.method === "POST" && req.url === "/api/confirm") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { userId, actionId, accepted } = JSON.parse(body || "{}");
          const reply = await agent.confirm(userId || "desktop-user", actionId, accepted);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(reply));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: "Erreur serveur", error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    console.log(`💻 Hands-Free Desktop Vocal est accessible sur : http://localhost:${PORT}`);
  });
}
