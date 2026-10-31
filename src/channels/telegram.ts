import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import type { Agent, Input, Reply, Voice } from "../types.js";

type TelegramOptions = {
  token: string;
  allowedUserIds: ReadonlySet<string>;
  agent: Agent;
  voice: Voice;
  fetchFile?: typeof fetch;
};

const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

function confirmationKeyboard(actionId: string): InlineKeyboard {
  const yesData = `confirm:yes:${actionId}`;
  const noData = `confirm:no:${actionId}`;
  if (Buffer.byteLength(yesData) > 64 || Buffer.byteLength(noData) > 64) {
    throw new Error("Pending action ID is too long for a Telegram confirmation button");
  }
  return new InlineKeyboard()
    .text("Oui", yesData)
    .text("Non", noData);
}

function getUserId(ctx: Context): string {
  if (!ctx.from) {
    throw new Error("Telegram update has no sender");
  }
  return String(ctx.from.id);
}

export function createTelegramBot(options: TelegramOptions): Bot {
  if (!options.token.trim()) {
    throw new Error("TELEGRAM_BOT_TOKEN must not be empty");
  }

  const bot = new Bot(options.token);
  const fetchFile = options.fetchFile ?? fetch;

  bot.use(async (ctx, next) => {
    const userId = ctx.from ? String(ctx.from.id) : undefined;
    if (!userId || !options.allowedUserIds.has(userId)) return;
    await next();
  });

  const speakReply = async (
    ctx: Context,
    reply: Reply,
  ) => {
    const message = reply.pending?.summary ?? reply.text;
    const markup = reply.pending
      ? confirmationKeyboard(reply.pending.id)
      : undefined;
    await ctx.reply(reply.text, markup ? { reply_markup: markup } : undefined);

    try {
      const audio = await options.voice.speak(message);
      await ctx.replyWithVoice(new InputFile(audio, "response.ogg"));
    } catch (error) {
      console.error("Voice response failed:", error);
      await ctx.reply("Je n'arrive pas à générer la réponse parlée pour le moment.");
    }
  };

  const reportFailure = async (
    ctx: Context,
    error: unknown,
  ) => {
    console.error("Telegram assistant request failed:", error);
    await speakReply(ctx, {
      text: "Je n'arrive pas à traiter ta demande pour le moment.",
    });
  };

  const downloadTelegramFile = async (fileId: string): Promise<Buffer> => {
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) {
      throw new Error("Telegram did not provide a file path");
    }
    let response: Response;
    try {
      response = await fetchFile(
        `https://api.telegram.org/file/bot${options.token}/${file.file_path}`,
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message.replaceAll(options.token, "[redacted]")
          : "Unknown network error";
      throw new Error(`Telegram file download failed: ${detail}`);
    }
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TELEGRAM_FILE_BYTES) {
      throw new Error("Telegram file exceeds the 20 MiB download limit");
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Telegram returned an empty file response");
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_TELEGRAM_FILE_BYTES) {
          await reader.cancel();
          throw new Error("Telegram file exceeds the 20 MiB download limit");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, totalBytes);
  };

  bot.on("message:text", async (ctx) => {
    try {
      const userId = getUserId(ctx);
      const reply = await options.agent.handle(userId, { text: ctx.message.text });
      await speakReply(ctx, reply);
    } catch (error) {
      await reportFailure(ctx, error);
    }
  });

  bot.on("message:voice", async (ctx) => {
    try {
      const userId = getUserId(ctx);
      const audio = await downloadTelegramFile(ctx.message.voice.file_id);
      const reply = await options.agent.handle(userId, {
        audio,
        mimeType: ctx.message.voice.mime_type ?? "audio/ogg",
      });
      await speakReply(ctx, reply);
    } catch (error) {
      await reportFailure(ctx, error);
    }
  });

  bot.on("message:photo", async (ctx) => {
    try {
      const userId = getUserId(ctx);
      const photo = ctx.message.photo.at(-1);
      if (!photo) {
        await speakReply(ctx, {
          text: "Je n'ai pas pu lire cette photo. Peux-tu la renvoyer ?",
        });
        return;
      }
      const image = await downloadTelegramFile(photo.file_id);
      const input: Input = {
        image,
        mimeType: "image/jpeg",
      };
      if (ctx.message.caption) input.text = ctx.message.caption;
      const reply = await options.agent.handle(userId, input);
      await speakReply(ctx, reply);
    } catch (error) {
      await reportFailure(ctx, error);
    }
  });

  bot.callbackQuery(/^confirm:(yes|no):(.+)$/, async (ctx) => {
    try {
      const match = ctx.match;
      if (!match) {
        throw new Error("Invalid confirmation callback");
      }
      const [, choice, actionId] = match;
      await ctx.answerCallbackQuery();
      const reply = await options.agent.confirm(
        getUserId(ctx),
        actionId,
        choice === "yes",
      );
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      } catch (error) {
        console.error("Could not clear the Telegram confirmation buttons:", error);
      }
      await speakReply(ctx, reply);
    } catch (error) {
      await reportFailure(ctx, error);
    }
  });

  bot.catch(async (error) => {
    console.error("Telegram bot update failed:", error);
    const ctx = error.ctx;
    if (ctx.from && options.allowedUserIds.has(String(ctx.from.id))) {
      await reportFailure(ctx, error.error);
    }
  });

  return bot;
}
