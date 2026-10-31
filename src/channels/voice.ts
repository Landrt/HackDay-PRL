import { spawn } from "node:child_process";
import type { Voice } from "../types.js";

type CommandRunner = (
  command: string,
  args: string[],
  input: Buffer,
) => Promise<Buffer>;

type VoiceOptions = {
  piperBin: string;
  voicePath: string;
  ffmpegBin?: string;
  timeoutMs?: number;
};

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function runCommand(
  command: string,
  args: string[],
  input: Buffer,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let outputBytes = 0;
    let errorBytes = 0;
    let settled = false;

    const finish = (error?: Error, result?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result ?? Buffer.alloc(0));
    };

    const timeout = setTimeout(() => {
      process.kill();
      finish(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    process.once("error", (error) => {
      finish(new Error(`Unable to start ${command}: ${error.message}`));
    });

    process.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        process.kill();
        finish(new Error(`${command} output exceeded the size limit`));
        return;
      }
      output.push(chunk);
    });

    process.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 16_384) return;
      const remaining = 16_384 - errorBytes;
      const boundedChunk = chunk.subarray(0, remaining);
      errors.push(boundedChunk);
      errorBytes += boundedChunk.length;
    });

    process.once("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString("utf8").trim();
        finish(
          new Error(
            `${command} failed (${signal ? `signal ${signal}` : `exit ${code}`})${detail ? `: ${detail}` : ""}`,
          ),
        );
        return;
      }
      finish(undefined, Buffer.concat(output));
    });

    process.stdin.once("error", (error) => {
      if (!settled) finish(new Error(`Unable to send input to ${command}: ${error.message}`));
    });
    process.stdin.end(input);
  });
}

export class PiperVoice implements Voice {
  private readonly options: VoiceOptions;
  private readonly ffmpegBin: string;
  private readonly timeoutMs: number;
  private readonly run: CommandRunner;

  constructor(
    options: VoiceOptions,
    runner?: CommandRunner,
  ) {
    this.options = options;
    this.ffmpegBin = options.ffmpegBin ?? "ffmpeg";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.run = runner ?? ((command, args, input) => runCommand(command, args, input, this.timeoutMs));

    if (!options.piperBin.trim()) {
      throw new Error("PIPER_BIN must not be empty");
    }
    if (!options.voicePath.trim()) {
      throw new Error("PIPER_VOICE must point to a Piper voice model");
    }
  }

  async speak(text: string): Promise<Buffer> {
    if (!text.trim()) {
      throw new Error("Cannot synthesize an empty response");
    }

    const wav = await this.run(
      this.options.piperBin,
      ["--model", this.options.voicePath],
      Buffer.from(`${text.trim().replace(/\s+/gu, " ")}\n`, "utf8"),
    );
    const ogg = await this.run(
      this.ffmpegBin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "wav",
        "-i",
        "pipe:0",
        "-ac",
        "1",
        "-c:a",
        "libopus",
        "-f",
        "ogg",
        "pipe:1",
      ],
      wav,
    );

    if (ogg.length === 0) {
      throw new Error("ffmpeg produced an empty OGG/Opus voice message");
    }
    return ogg;
  }
}
