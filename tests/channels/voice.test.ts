import { describe, expect, it, vi } from "vitest";
import { PiperVoice } from "../../src/channels/voice.js";

describe("PiperVoice", () => {
  it("synthesizes with Piper and converts the WAV output to OGG/Opus", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from("wav"))
      .mockResolvedValueOnce(Buffer.from("ogg"));
    const voice = new PiperVoice(
      { piperBin: "piper", voicePath: "/voices/fr.onnx", ffmpegBin: "ffmpeg" },
      run,
    );

    await expect(voice.speak("Bonjour")).resolves.toEqual(Buffer.from("ogg"));
    expect(run).toHaveBeenNthCalledWith(
      1,
      "piper",
      ["--model", "/voices/fr.onnx"],
      Buffer.from("Bonjour\n"),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      "ffmpeg",
      expect.arrayContaining(["-c:a", "libopus", "-f", "ogg", "pipe:1"]),
      Buffer.from("wav"),
    );
  });

  it("does not run Piper for an empty response", async () => {
    const run = vi.fn();
    const voice = new PiperVoice(
      { piperBin: "piper", voicePath: "/voices/fr.onnx" },
      run,
    );

    await expect(voice.speak("  ")).rejects.toThrow("empty response");
    expect(run).not.toHaveBeenCalled();
  });

  it("reports missing Piper configuration and empty ffmpeg output", async () => {
    expect(
      () => new PiperVoice({ piperBin: "piper", voicePath: " " }),
    ).toThrow("PIPER_VOICE");

    const run = vi.fn().mockResolvedValueOnce(Buffer.from("wav")).mockResolvedValueOnce(Buffer.alloc(0));
    const voice = new PiperVoice(
      { piperBin: "piper", voicePath: "/voices/fr.onnx" },
      run,
    );
    await expect(voice.speak("Bonjour")).rejects.toThrow("empty OGG/Opus");
  });

  it("surfaces Piper and ffmpeg execution errors", async () => {
    const run = vi.fn().mockRejectedValue(new Error("Piper is unavailable"));
    const voice = new PiperVoice(
      { piperBin: "piper", voicePath: "/voices/fr.onnx" },
      run,
    );
    await expect(voice.speak("Bonjour")).rejects.toThrow("Piper is unavailable");

    const ffmpegFailure = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from("wav"))
      .mockRejectedValueOnce(new Error("ffmpeg failed"));
    const voiceWithFfmpegFailure = new PiperVoice(
      { piperBin: "piper", voicePath: "/voices/fr.onnx" },
      ffmpegFailure,
    );
    await expect(voiceWithFfmpegFailure.speak("Bonjour")).rejects.toThrow(
      "ffmpeg failed",
    );
  });
});
