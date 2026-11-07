import { createTextClipboardPlugin, PluginRegistry } from "@syncert/core";
import {
  readText as tauriRead,
  writeText as tauriWrite,
} from "@tauri-apps/plugin-clipboard-manager";
export interface ClipboardAdapter {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<void>;
  isSensitive?(): Promise<boolean>;
}
export const tauriClipboard: ClipboardAdapter = {
  readText: () => tauriRead(),
  writeText: (text) => tauriWrite(text),
  isSensitive: async () =>
    (await import("@tauri-apps/api/core")).invoke("clipboard_is_sensitive"),
};
export function textRegistry(clipboard: ClipboardAdapter): PluginRegistry {
  return new PluginRegistry().register(createTextClipboardPlugin(clipboard));
}
