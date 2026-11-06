import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createRelay,
  type Relay,
} from "../vendor/syncert-core/apps/server/src/server";
import { generateSpaceKey, importSpaceKey } from "@syncert/crypto";
import {
  PluginRegistry,
  SyncEngine,
  WebSocketTransport,
  createTextClipboardPlugin,
} from "@syncert/core";
const delay = () => new Promise((r) => setTimeout(r, 40));
async function until(condition: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (condition()) return;
    await delay();
  }
  throw new Error("relay wait timed out");
}
describe("two desktop engines using the real relay", () => {
  let relay: Relay;
  let url: string;
  const engines: SyncEngine[] = [];
  beforeAll(async () => {
    relay = createRelay({
      config: {
        port: 0,
        host: "127.0.0.1",
        dbPath: ":memory:",
        logLevel: "silent",
      },
    });
    url = `ws://127.0.0.1:${(await relay.listen()).port}`;
  });
  afterAll(async () => {
    for (const engine of engines) await engine.stop();
    await relay.close();
  });
  async function enroll() {
    const first = (await (
      await fetch(url.replace("ws:", "http:") + "/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).json()) as { spaceId: string; deviceId: string; deviceToken: string };
    const pair = (await (
      await fetch(url.replace("ws:", "http:") + "/pair/token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${first.deviceToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).json()) as { joinToken: string };
    const second = (await (
      await fetch(url.replace("ws:", "http:") + "/pair/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinToken: pair.joinToken }),
      })
    ).json()) as { deviceId: string; deviceToken: string };
    return { first, second, keys: await importSpaceKey(generateSpaceKey()) };
  }
  function client(
    credentials: { deviceId: string; deviceToken: string },
    spaceId: string,
    keys: Awaited<ReturnType<typeof importSpaceKey>>,
    incoming: string[],
  ) {
    const registry = new PluginRegistry().register(
      createTextClipboardPlugin({
        readText: () => Promise.resolve(null),
        writeText: (text) => {
          incoming.push(text);
          return Promise.resolve();
        },
      }),
    );
    const transport = new WebSocketTransport(
      url,
      credentials.deviceToken,
      (address) => new WebSocket(address) as never,
    );
    let queue = 1;
    const engine = new SyncEngine({
      spaceId,
      deviceId: credentials.deviceId,
      keys,
      registry,
      transport,
      onState: (state) => {
        queue = state.queue.length;
      },
      onError: (error) => {
        throw error;
      },
    });
    engines.push(engine);
    return { engine, transport, queue: () => queue };
  }
  it("fans out in both directions with the shared space key", async () => {
    const { first, second, keys } = await enroll();
    const a: string[] = [];
    const b: string[] = [];
    const left = client(first, first.spaceId, keys, a);
    const right = client(second, first.spaceId, keys, b);
    left.engine.start();
    right.engine.start();
    await until(
      () => left.transport.state === "open" && right.transport.state === "open",
    );
    await left.engine.publish("clipboard.text", "from A");
    await until(() => b.includes("from A"));
    await right.engine.publish("clipboard.text", "from B");
    await until(() => a.includes("from B"));
    expect(a).toEqual(["from B"]);
    expect(b).toEqual(["from A"]);
  });
  it("catches up offline clients and persists outgoing ciphertext while disconnected", async () => {
    const { first, second, keys } = await enroll();
    const left = client(first, first.spaceId, keys, []);
    await left.engine.publish("clipboard.text", "offline");
    expect(left.queue()).toBe(1);
    left.engine.start();
    await until(() => left.queue() === 0 && left.transport.state === "open");
    const received: string[] = [];
    const right = client(second, first.spaceId, keys, received);
    right.engine.start();
    await until(() => received.includes("offline"));
    expect(received).toEqual(["offline"]);
    expect(relay.store.countItems(first.spaceId)).toBe(1);
  });
  it("reconnects and receives newer text after a disconnect", async () => {
    const { first, second, keys } = await enroll();
    const received: string[] = [];
    const left = client(first, first.spaceId, keys, []);
    const right = client(second, first.spaceId, keys, received);
    left.engine.start();
    right.engine.start();
    await until(
      () => left.transport.state === "open" && right.transport.state === "open",
    );
    await right.transport.close();
    await until(() => right.transport.state === "open");
    await left.engine.publish("clipboard.text", "after reconnect");
    await until(() => received.includes("after reconnect"));
    expect(received).toEqual(["after reconnect"]);
  });
});
