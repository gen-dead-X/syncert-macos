import type { DeviceInfo, ServerFrame } from "@syncert/protocol";
import type { SyncTransport } from "@syncert/core";
function request(
  transport: SyncTransport,
  frame: Parameters<SyncTransport["send"]>[0],
  expected: ServerFrame["type"],
): Promise<ServerFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error("relay request timed out"));
    }, 15_000);
    const off = transport.onFrame((response) => {
      if (response.type === "error") {
        clearTimeout(timer);
        off();
        reject(new Error(response.message));
      }
      if (response.type === expected) {
        clearTimeout(timer);
        off();
        resolve(response);
      }
    });
    transport.send(frame).catch((error: unknown) => {
      clearTimeout(timer);
      off();
      reject(error instanceof Error ? error : new Error("request failed"));
    });
  });
}
export async function listDevices(
  transport: SyncTransport,
): Promise<DeviceInfo[]> {
  const response = await request(
    transport,
    { type: "device.list" },
    "device.list.result",
  );
  if (response.type !== "device.list.result") return [];
  return response.devices;
}
export async function revokeDevice(
  transport: SyncTransport,
  deviceId: string,
): Promise<void> {
  await request(
    transport,
    { type: "device.revoke", deviceId },
    "device.revoked",
  );
}
