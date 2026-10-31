import { Bot, InlineKeyboard, InputFile } from "grammy";
import { config } from "./config.js";
import { agent } from "./core/agent.js";
import { voice } from "./channels/voice.js";

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error("❌ ERREUR : TELEGRAM_BOT_TOKEN manquant dans le fichier .env !");
  process.exit(1);
}

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Sécurité : Vérification de la liste blanche d'utilisateurs
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id.toString();
  if (config.ALLOWED_USER_IDS.length > 0 && userId && !config.ALLOWED_USER_IDS.includes(userId)) {
    await ctx.reply("Accès non autorisé à cet assistant.");
    return;
  }
  await next();
});

// Helper pour répondre TOUJOURS par la voix + court texte
async function replyWithVoiceAndText(
  ctx: any,
  text: string,
  replyMarkup?: any
): Promise<void> {
  // 1. Envoi du texte
  if (replyMarkup) {
    await ctx.reply(text, { reply_markup: replyMarkup });
  } else {
    await ctx.reply(text);
  }

  // 2. Envoi de la note vocale (TTS parlée)
  try {
    const audioBuffer = await voice.speak(text);
    await ctx.replyWithVoice(new InputFile(audioBuffer, "reponse.mp3"));
  } catch (err) {
    console.error("Erreur de synthèse vocale :", err);
  }
}

// Commande /start
bot.command("start", async (ctx) => {
  const welcomeText =
    "Bonjour ! Je suis Hands-Free, ton assistant d'accessibilité propulsé par Gemma 4. " +
    "Tu peux me parler ou m'écrire pour gérer ton agenda, envoyer un message ou me montrer une photo.";

  await replyWithVoiceAndText(ctx, welcomeText);
});

// Gestion des messages texte
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;

  await ctx.replyWithChatAction("typing");

  try {
    const reply = await agent.handle(userId, { text });

    if (reply.pending) {
      // Action sensible nécessitant confirmation
      const keyboard = new InlineKeyboard()
        .text("✅ Oui", `confirm:${reply.pending.id}:yes`)
        .text("❌ Non", `confirm:${reply.pending.id}:no`);

      await replyWithVoiceAndText(ctx, reply.text, keyboard);
    } else {
      await replyWithVoiceAndText(ctx, reply.text);
    }
  } catch (err: any) {
    console.error("Erreur agent :", err);
    await replyWithVoiceAndText(ctx, "Désolé, une erreur est survenue lors du traitement.");
  }
});

// Gestion des boutons de confirmation inline
bot.on("callback_query:data", async (ctx) => {
  const userId = ctx.from.id.toString();
  const data = ctx.callbackQuery.data;

  if (data.startsWith("confirm:")) {
    const [, actionId, choice] = data.split(":");
    const accepted = choice === "yes";

    const reply = await agent.confirm(userId, actionId, accepted);
    await ctx.answerCallbackQuery();
    await replyWithVoiceAndText(ctx, reply.text);
  }
});

// Gestion des photos envoyées (Vision)
bot.on("message:photo", async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.replyWithChatAction("typing");

  try {
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1]; // Plus haute résolution
    const file = await ctx.api.getFile(bestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const res = await fetch(fileUrl);
    const arrayBuffer = await res.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const reply = await agent.handle(userId, {
      image: imageBuffer,
      mimeType: "image/jpeg"
    });

    await replyWithVoiceAndText(ctx, reply.text);
  } catch (err) {
    console.error("Erreur analyse photo :", err);
    await replyWithVoiceAndText(ctx, "Désolé, je n'ai pas pu analyser la photo.");
  }
});

// Gestion des notes vocales entrantes
bot.on(["message:voice", "message:audio"], async (ctx) => {
  await replyWithVoiceAndText(
    ctx,
    "J'ai bien reçu ta note vocale. L'intégration de la transcription vocale directe sur Telegram est en cours avec le Membre B. En attendant, tu peux m'écrire ta demande et je te répondrai à voix haute !"
  );
});

import { startDesktopServer } from "./channels/desktop.js";

// Démarrer l'interface PC / Desktop en direct
startDesktopServer();

console.log("🚀 Hands-Free Telegram Bot (avec réponses vocales) est en cours d'exécution...");
bot.start();
