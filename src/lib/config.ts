import { LazyStore } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { Credentials } from "./relay";
import type { HistoryEntry } from "./history";
import type { SyncEngineState, QueuedItem } from "@syncert/core";
import type { WireSyncItem } from "@syncert/protocol";
import { bytesToBase64, base64ToBytes } from "@syncert/protocol";
export interface PublicIdentity {
  spaceId: string;
  deviceId: string;
  relayUrl: string;
}
interface StoredConfig {
  identity?: PublicIdentity;
  engine?: { lastItemId: string | null; queue: WireSyncItem[] };
  history?: HistoryEntry[];
  shortcut: string;
  launchAtLogin: boolean;
}
export interface Config {
  credentials?: Credentials;
  history: HistoryEntry[];
  shortcut: string;
  launchAtLogin: boolean;
}
export async function loadConfig(): Promise<Config> {
  const raw = await new LazyStore("settings.json").get<StoredConfig>("config");
  if (!raw?.identity)
    return {
      shortcut: "CommandOrControl+Shift+V",
      launchAtLogin: false,
      history: [],
    };
  const [key, deviceToken] = await Promise.all([
    invoke<string | null>("load_secret", { key: "spaceKey" }),
    invoke<string | null>("load_secret", { key: "deviceToken" }),
  ]);
  return {
    credentials:
      key && deviceToken ? { ...raw.identity, key, deviceToken } : undefined,
    history: raw.history ?? [],
    shortcut: raw.shortcut ?? "CommandOrControl+Shift+V",
    launchAtLogin: raw.launchAtLogin ?? false,
  };
}
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await Promise.all([
    invoke("store_secret", { key: "spaceKey", value: credentials.key }),
    invoke("store_secret", {
      key: "deviceToken",
      value: credentials.deviceToken,
    }),
  ]);
}
export async function saveConfig(
  config: Config,
  engine?: SyncEngineState,
): Promise<void> {
  if (!config.credentials) return;
  const { spaceId, deviceId, relayUrl } = config.credentials;
  const queue = (engine?.queue ?? []).map(({ item }) => ({
    ...item,
    payload: bytesToBase64(item.payload),
    nonce: bytesToBase64(item.nonce),
  }));
  await new LazyStore("settings.json").set("config", {
    identity: { spaceId, deviceId, relayUrl },
    engine: { lastItemId: engine?.lastItemId ?? null, queue },
    history: config.history.slice(0, 50),
    shortcut: config.shortcut,
    launchAtLogin: config.launchAtLogin,
  } satisfies StoredConfig);
  await new LazyStore("settings.json").save();
}
export function restoreQueue(items: WireSyncItem[]): QueuedItem[] {
  return items.map((item) => ({
    item: {
      ...item,
      payload: base64ToBytes(item.payload),
      nonce: base64ToBytes(item.nonce),
    },
  }));
}
export async function configureDesktop(config: Config): Promise<void> {
  await invoke("set_shortcut", { shortcut: config.shortcut });
  await invoke("autostart", { enabled: config.launchAtLogin });
}
