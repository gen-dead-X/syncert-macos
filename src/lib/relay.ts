import {
  decodePairingPayload,
  encodePairingPayload,
  generateSpaceKey,
} from "@syncert/crypto";
import { bytesToBase64, base64ToBytes } from "@syncert/protocol";
export interface Credentials {
  spaceId: string;
  deviceId: string;
  deviceToken: string;
  key: string;
  relayUrl: string;
}
const apiUrl = (base: string, path: string) => {
  const url = new URL(base);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
  return url.toString();
};
async function request<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(apiUrl(base, path), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? `Relay request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export async function createSpace(
  relayUrl: string,
  secret?: string,
): Promise<Credentials> {
  const result = await request<Omit<Credentials, "key" | "relayUrl">>(
    relayUrl,
    "/spaces",
    {
      method: "POST",
      body: "{}",
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    },
  );
  return { ...result, key: bytesToBase64(generateSpaceKey()), relayUrl };
}
export async function joinSpace(pairing: string): Promise<Credentials> {
  const payload = decodePairingPayload(pairing);
  const result = await request<Omit<Credentials, "key" | "relayUrl">>(
    payload.relayUrl,
    "/pair/join",
    { method: "POST", body: JSON.stringify({ joinToken: payload.joinToken }) },
  );
  return {
    ...result,
    key: bytesToBase64(payload.spaceKey),
    relayUrl: payload.relayUrl,
  };
}
export async function pairString(
  credentials: Credentials,
): Promise<{ value: string; expiresAt: number }> {
  const result = await request<{ joinToken: string; expiresAt: number }>(
    credentials.relayUrl,
    "/pair/token",
    {
      method: "POST",
      body: "{}",
      headers: { Authorization: `Bearer ${credentials.deviceToken}` },
    },
  );
  return {
    value: encodePairingPayload({
      spaceKey: base64ToBytes(credentials.key),
      relayUrl: credentials.relayUrl,
      joinToken: result.joinToken,
    }),
    expiresAt: result.expiresAt,
  };
}
export const keyFromBase64 = base64ToBytes;
