import {
  computeContentHash,
  importSpaceKey,
  type SpaceKeys,
} from "@syncert/crypto";
import { utf8Encode } from "@syncert/protocol";
import type { SyncEngine } from "@syncert/core";
export interface ClipboardControllerOptions {
  clipboard: {
    readText(): Promise<string | null>;
    writeText(text: string): Promise<void>;
    isSensitive?(): Promise<boolean>;
  };
  keys: SpaceKeys;
  intervalMs?: number;
  onText(text: string, remote: boolean): void;
  onError(error: Error): void;
}
/** Polls the OS clipboard without storing sensitive values or reflecting remote writes. */
export class ClipboardController {
  #timer: ReturnType<typeof setInterval> | undefined;
  #lastHash: string | undefined;
  #remoteHash: string | undefined;
  #paused = false;
  #busy = false;
  engine?: SyncEngine;
  constructor(private readonly options: ClipboardControllerOptions) {}
  start(): void {
    if (!this.#timer)
      this.#timer = setInterval(
        () => void this.poll(),
        this.options.intervalMs ?? 400,
      );
  }
  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
  async setPaused(paused: boolean): Promise<void> {
    this.#paused = paused;
    if (!paused) this.#lastHash = undefined;
  }
  async applyRemote(text: string): Promise<void> {
    this.#remoteHash = await computeContentHash(
      this.options.keys,
      utf8Encode(text),
    );
    this.options.onText(text, true);
  }
  async poll(): Promise<boolean> {
    if (this.#paused || this.#busy) return false;
    this.#busy = true;
    try {
      if (await this.options.clipboard.isSensitive?.()) {
        this.#lastHash = undefined;
        this.#remoteHash = undefined;
        return false;
      }
      const text = await this.options.clipboard.readText();
      if (text === null || text === "") return false;
      const hash = await computeContentHash(
        this.options.keys,
        utf8Encode(text),
      );
      if (hash === this.#lastHash || hash === this.#remoteHash) {
        if (hash === this.#remoteHash) this.#remoteHash = undefined;
        this.#lastHash = hash;
        return false;
      }
      this.#lastHash = hash;
      await this.engine?.publish("clipboard.text", text);
      this.options.onText(text, false);
      return true;
    } catch (error) {
      this.options.onError(
        error instanceof Error ? error : new Error("clipboard failed"),
      );
      return false;
    } finally {
      this.#busy = false;
    }
  }
}
