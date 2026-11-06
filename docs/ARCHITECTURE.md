# Desktop architecture

`SyncEngine` and `WebSocketTransport` are proposed additions to `@syncert/core`. They reuse the existing `SyncTransport`, `PluginRegistry`, protocol schemas, AES-GCM and keyed-hash crypto. `ClipboardController` is app/local-only: it controls polling and suppression, never develops a different encryption or framing behavior.

Remote application → platform clipboard write → suppress same content at next read. Pause suppresses reading and publishing. Native sensitive checks run before the clipboard plugin reads text. No clipboard content is sent to Rust logging or analytics.

The React layer only holds plaintext in memory deliberately for clipboard/history display, saves the last 50 + pinned history locally, and saves ciphertext queued for delivery (no plaintext in the outgoing queue). Space keys and device bearer tokens are accessible only through narrow Rust commands backed by the `keyring` crate. The desktop has no authentication for any command exposed outside its own trusted WebView.

Local settings include relay, space/device IDs, history and window preferences. A pairing QR contains the space key; its lifetime is bounded by the relay's one-time join-token TTL. Device revocation does not rotate a known-compromised space key: use a new space instead.

`platform/macos.rs` wraps `NSPasteboard` metadata. `windows.rs` detects `ExcludeClipboardContentFromMonitorProcessing`; Linux returns false for now. Network, crypto and other platform-independent code stays TypeScript. macOS Accessory mode hides the Dock icon and launch-at-login uses the Tauri autostart plugin.

## Known follow-ups before production

Native macOS package/build/UI credential and global shortcut checks; app-specific clipboard ignore lists; history retention/erasure settings; native tests in CI; signed/notarized distribution; local-history encryption/decision if beyond Phase 1 scope.
