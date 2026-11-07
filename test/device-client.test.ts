import { describe, expect, it } from "vitest";
import { StubTransport } from "@syncert/core";
import { listDevices, revokeDevice } from "../src/lib/device-client";
describe("device operations", () => {
  it("requests device list and waits for response", async () => {
    const transport = new StubTransport();
    void transport.connect();
    setTimeout(
      () =>
        transport.receive({
          type: "device.list.result",
          devices: [{ deviceId: "one", createdAt: 1, lastSeenAt: null }],
        }),
      0,
    );
    expect((await listDevices(transport))[0]?.deviceId).toBe("one");
    await transport.close();
  });
  it("revokes a selected device", async () => {
    const transport = new StubTransport();
    void transport.connect();
    setTimeout(
      () => transport.receive({ type: "device.revoked", deviceId: "one" }),
      0,
    );
    await expect(revokeDevice(transport, "one")).resolves.toBeUndefined();
    expect(transport.sent[0]).toMatchObject({
      type: "device.revoke",
      deviceId: "one",
    });
    await transport.close();
  });
});
