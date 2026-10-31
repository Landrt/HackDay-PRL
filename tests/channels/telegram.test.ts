import { describe, expect, it, vi } from "vitest";
import type { Agent, Reply, Voice } from "../../src/types.js";
import { createTelegramBot } from "../../src/channels/telegram.js";

type ApiRequest = {
  method: string;
  payload: Record<string, unknown>;
};

function makeBot(
  agent: Agent,
  voice: Voice,
  allowedUserIds = new Set(["42"]),
  fetchFile: typeof fetch = vi.fn(async () => new Response(Buffer.from("file"))),
) {
  const requests: ApiRequest[] = [];
  const bot = createTelegramBot({
    token: "test-token",
    allowedUserIds,
    agent,
    voice,
    fetchFile,
  });
  bot.api.config.use(async (_previous, method, payload) => {
    requests.push({ method, payload: payload as Record<string, unknown> });
    if (method === "getFile") {
      return { ok: true, result: { file_id: "file", file_unique_id: "unique", file_path: "file.ogg" } };
    }
    return { ok: true, result: true };
  });
  return { bot, requests };
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    handle: async () => ({ text: "" }),
    confirm: async () => ({ text: "" }),
    ...overrides,
  };
}

const voice: Voice = { speak: vi.fn(async () => Buffer.from("ogg")) };

function incomingMessage(
  message: Record<string, unknown>,
  fromId = 42,
) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      date: 1_798_000_000,
      chat: { id: fromId, type: "private", first_name: "Test" },
      from: { id: fromId, is_bot: false, first_name: "Test" },
      ...message,
    },
  };
}

describe("Telegram channel", () => {
  it("does not process or answer updates from users outside the allowlist", async () => {
    const handle = vi.fn();
    const { bot, requests } = makeBot(makeAgent({ handle }), voice);

    await bot.handleUpdate(incomingMessage({ text: "Bonjour" }, 7));
    expect(handle).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it("passes text to the injected agent and sends text plus voice", async () => {
    const handle = vi.fn<Agent["handle"]>().mockResolvedValue({ text: "Bonjour !" });
    const voiceOutput = { speak: vi.fn(async () => Buffer.from("ogg")) };
    const { bot, requests } = makeBot(
      makeAgent({ handle }),
      voiceOutput,
    );

    await bot.handleUpdate(incomingMessage({ text: "Salut" }));
    expect(handle).toHaveBeenCalledWith("42", { text: "Salut" });
    expect(requests.map(({ method }) => method)).toEqual(["sendMessage", "sendVoice"]);
    expect(voiceOutput.speak).toHaveBeenCalledWith("Bonjour !");
  });

  it("forwards voice and the pending confirmation buttons without implementing the agent", async () => {
    const audio = Buffer.from("telegram-audio");
    const fetchFile = vi.fn(async () => new Response(audio));
    const pending: Reply = {
      text: "Confirmer l'envoi ?",
      pending: { id: "action-123", summary: "Je vais envoyer le message. Je confirme ?" },
    };
    const handle = vi.fn<Agent["handle"]>().mockResolvedValue(pending);
    const confirm = vi.fn<Agent["confirm"]>().mockResolvedValue({ text: "" });
    const { bot, requests } = makeBot(
      makeAgent({ handle, confirm }),
      voice,
      new Set(["42"]),
      fetchFile,
    );

    await bot.handleUpdate(
      incomingMessage({ voice: { file_id: "voice-id", mime_type: "audio/ogg" } }),
    );

    expect(fetchFile).toHaveBeenCalledWith(
      "https://api.telegram.org/file/bottest-token/file.ogg",
    );
    expect(handle).toHaveBeenCalledWith("42", {
      audio,
      mimeType: "audio/ogg",
    });
    const message = requests.find(({ method }) => method === "sendMessage");
    expect(message?.payload.reply_markup).toMatchObject({
      inline_keyboard: [
        [{ text: "Oui", callback_data: "confirm:yes:action-123" }, { text: "Non", callback_data: "confirm:no:action-123" }],
      ],
    });
  });

  it("forwards the largest photo and its caption to the agent", async () => {
    const image = Buffer.from("telegram-photo");
    const fetchFile = vi.fn(async () => new Response(image));
    const handle = vi.fn<Agent["handle"]>().mockResolvedValue({ text: "Une photo." });
    const { bot } = makeBot(
      makeAgent({ handle }),
      voice,
      new Set(["42"]),
      fetchFile,
    );

    await bot.handleUpdate(
      incomingMessage({
        caption: "Que vois-tu ?",
        photo: [
          { file_id: "small", file_unique_id: "small", width: 10, height: 10 },
          { file_id: "large", file_unique_id: "large", width: 100, height: 100 },
        ],
      }),
    );

    expect(handle).toHaveBeenCalledWith("42", {
      image,
      mimeType: "image/jpeg",
      text: "Que vois-tu ?",
    });
  });

  it("passes yes/no button callbacks to Agent.confirm with the owning user ID", async () => {
    const confirm = vi.fn<Agent["confirm"]>().mockResolvedValue({ text: "C'est fait." });
    const { bot, requests } = makeBot(makeAgent({ confirm }), voice);

    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: "callback-id",
        from: { id: 42, is_bot: false, first_name: "Test" },
        chat_instance: "chat",
        data: "confirm:no:action-123",
        message: {
          message_id: 10,
          date: 1_798_000_000,
          chat: { id: 42, type: "private", first_name: "Test" },
          text: "Confirmer ?",
        },
      },
    });

    expect(confirm).toHaveBeenCalledWith("42", "action-123", false);
    expect(requests.map(({ method }) => method)).toEqual([
      "answerCallbackQuery",
      "sendMessage",
      "sendVoice",
      "editMessageReplyMarkup",
    ]);
  });
});
