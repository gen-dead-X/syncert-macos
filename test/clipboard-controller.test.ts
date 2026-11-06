import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSpaceKey, importSpaceKey } from "@syncert/crypto";
import { ClipboardController } from "../src/lib/clipboard-controller";
const item = {
  id: "",
  spaceId: "",
  originDeviceId: "",
  kind: "clipboard.text",
  schemaVersion: 1,
  createdAt: 0,
  payload: new Uint8Array(),
  nonce: new Uint8Array(),
  contentHash: "",
};
describe("ClipboardController", () => {
  let keys: Awaited<ReturnType<typeof importSpaceKey>>;
  beforeEach(async () => {
    keys = await importSpaceKey(generateSpaceKey());
  });
  it("publishes changed text only once", async () => {
    const clipboard = {
      readText: vi.fn().mockResolvedValue("hello"),
      writeText: vi.fn(),
    };
    const publish = vi.fn();
    const record = vi.fn();
    const c = new ClipboardController({
      clipboard,
      keys,
      onText: record,
      onError: (e) => {
        throw e;
      },
    });
    c.engine = { publish } as never;
    expect(await c.poll()).toBe(true);
    expect(await c.poll()).toBe(false);
    expect(publish).toHaveBeenCalledWith("clipboard.text", "hello");
    expect(record).toHaveBeenCalledOnce();
    c.stop();
  });
  it("does not reflect remote content back to the relay", async () => {
    const clipboard = {
      readText: vi.fn().mockResolvedValue("remote"),
      writeText: vi.fn(),
    };
    const publish = vi.fn();
    const c = new ClipboardController({
      clipboard,
      keys,
      onText: vi.fn(),
      onError: vi.fn(),
    });
    c.engine = { publish } as never;
    await c.applyRemote("remote");
    expect(await c.poll()).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(await c.poll()).toBe(false);
  });
  it("never reads or stores concealed clipboard data", async () => {
    const clipboard = {
      readText: vi.fn().mockResolvedValue("password"),
      writeText: vi.fn(),
      isSensitive: vi.fn().mockResolvedValue(true),
    };
    const publish = vi.fn();
    const c = new ClipboardController({
      clipboard,
      keys,
      onText: vi.fn(),
      onError: vi.fn(),
    });
    c.engine = { publish } as never;
    expect(await c.poll()).toBe(false);
    expect(clipboard.readText).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it("pause ignores clipboard until explicitly resumed", async () => {
    const clipboard = {
      readText: vi.fn().mockResolvedValue("text"),
      writeText: vi.fn(),
    };
    const publish = vi.fn();
    const c = new ClipboardController({
      clipboard,
      keys,
      onText: vi.fn(),
      onError: vi.fn(),
    });
    c.engine = { publish } as never;
    await c.setPaused(true);
    expect(await c.poll()).toBe(false);
    await c.setPaused(false);
    expect(await c.poll()).toBe(true);
  });
  it("clears loop prevention after sensitive clipboard selection", async () => {
    let sensitive = false;
    const clipboard = {
      readText: vi.fn().mockResolvedValue("password"),
      writeText: vi.fn(),
      isSensitive: () => Promise.resolve(sensitive),
    };
    const publish = vi.fn();
    const c = new ClipboardController({
      clipboard,
      keys,
      onText: vi.fn(),
      onError: vi.fn(),
    });
    c.engine = { publish } as never;
    await c.applyRemote("password");
    await c.poll();
    sensitive = true;
    await c.poll();
    sensitive = false;
    expect(await c.poll()).toBe(true);
    expect(publish).toHaveBeenCalledOnce();
  });
});
