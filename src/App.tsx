import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { importSpaceKey } from "@syncert/crypto";
import { SyncEngine, WebSocketTransport } from "@syncert/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  createSpace,
  joinSpace,
  pairString,
  keyFromBase64,
  type Credentials,
} from "./lib/relay";
import { textRegistry, tauriClipboard } from "./lib/desktop";
import { ClipboardController } from "./lib/clipboard-controller";
import {
  addHistory,
  filterHistory,
  togglePin,
  type HistoryEntry,
} from "./lib/history";
import { listDevices, revokeDevice } from "./lib/device-client";
import {
  loadConfig,
  saveConfig,
  saveCredentials,
  configureDesktop,
  restoreQueue,
  type Config,
} from "./lib/config";

export default function App() {
  const [mode, setMode] = useState<"loading" | "setup" | "ready">("loading");
  const [relay, setRelay] = useState("ws://localhost:8787");
  const [joinInput, setJoinInput] = useState("");
  const [pairing, setPairing] = useState("");
  const [qr, setQr] = useState("");
  const [tab, setTab] = useState<"history" | "devices" | "settings">("history");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const [devices, setDevices] = useState<
    { deviceId: string; lastSeenAt: number | null }[]
  >([]);
  const [config, setConfig] = useState<Config>({
    shortcut: "CommandOrControl+Shift+V",
    launchAtLogin: false,
    history: [],
  });
  const controller = useRef<ClipboardController | undefined>(undefined);
  const [transport, setTransport] = useState<WebSocketTransport>();
  const [credentials, setCredentials] = useState<Credentials>();
  const configRef = useRef(config);
  const historyRef = useRef(history);
  configRef.current = config;
  historyRef.current = history;
  const notify = (message: string) => setError(message);

  const start = useCallback(
    async (
      creds: Credentials,
      existing: Config,
      restored?: Parameters<typeof restoreQueue>[0],
      lastItemId?: string | null,
    ) => {
      const keys = await importSpaceKey(keyFromBase64(creds.key));
      const socket = new WebSocketTransport(creds.relayUrl, creds.deviceToken);
      setTransport(socket);
      const clip = new ClipboardController({
        clipboard: tauriClipboard,
        keys,
        onText: (text, remote) =>
          setHistory((items) =>
            addHistory(items, text, crypto.randomUUID(), Date.now(), remote),
          ),
        onError: (e) => notify(e.message),
      });
      const instance = new SyncEngine({
        spaceId: creds.spaceId,
        deviceId: creds.deviceId,
        keys,
        transport: socket,
        registry: textRegistry({
          ...tauriClipboard,
          writeText: async (text) => {
            await clip.applyRemote(text);
            await writeText(text);
          },
        }),
        initialState: {
          queue: restored ? restoreQueue(restored) : [],
          ...(lastItemId !== undefined ? { lastItemId } : {}),
        },
        onState: (state) => {
          void saveConfig(
            {
              ...configRef.current,
              credentials: creds,
              history: historyRef.current,
            },
            state,
          ).catch((e: Error) => notify(e.message));
        },
        onStatus: setStatus,
        onError: (e) => notify(e.message),
      });
      clip.engine = instance;
      controller.current = clip;
      instance.start();
      clip.start();
      setCredentials(creds);
      setMode("ready");
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    const unlisten = listen(
      "toggle-history",
      () => void invoke("toggle_window"),
    );
    void loadConfig()
      .then(async (loaded) => {
        if (!alive) return;
        setConfig(loaded);
        setHistory(loaded.history);
        const persisted = await new (
          await import("@tauri-apps/plugin-store")
        ).LazyStore("settings.json").get<{
          engine?: {
            lastItemId: string | null;
            queue: Parameters<typeof restoreQueue>[0];
          };
        }>("config");
        await configureDesktop(loaded);
        if (loaded.credentials)
          await start(
            loaded.credentials,
            loaded,
            persisted?.engine?.queue,
            persisted?.engine?.lastItemId,
          );
        else setMode("setup");
      })
      .catch((e: Error) => {
        notify(e.message);
        setMode("setup");
      });
    return () => {
      alive = false;
      void unlisten.then((f) => f);
      controller.current?.stop();
    };
  }, [start]);
  useEffect(() => {
    if (!credentials) return;
    const timer = setTimeout(
      () =>
        void saveConfig(
          { ...config, credentials, history },
          controller.current?.engine?.snapshot,
        ).catch((e: Error) => notify(e.message)),
      250,
    );
    return () => clearTimeout(timer);
  }, [history, credentials, config]);
  async function setupSpace(join: boolean) {
    try {
      const result = join
        ? await joinSpace(joinInput)
        : await createSpace(relay);
      await saveCredentials(result);
      const next = { ...config, credentials: result };
      setConfig(next);
      await start(result, next);
      setJoinInput("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not configure space");
    }
  }
  async function pair() {
    if (!credentials) return;
    try {
      const result = await pairString(credentials);
      setPairing(result.value);
      setQr(await QRCode.toDataURL(result.value, { margin: 2, width: 240 }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Pairing failed");
    }
  }
  async function refreshDevices() {
    if (transport?.state === "open") {
      try {
        setDevices(await listDevices(transport));
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not list devices");
      }
    }
  }
  async function updateConfig(patch: Partial<Config>) {
    const next = { ...config, ...patch };
    setConfig(next);
    await configureDesktop(next).catch((e: Error) => notify(e.message));
  }
  async function togglePause() {
    const next = !paused;
    setPaused(next);
    await controller.current?.setPaused(next);
    await invoke("set_paused", { paused: next });
  }
  async function copy(text: string) {
    await controller.current?.applyRemote(text);
    await writeText(text);
  }
  if (mode === "loading")
    return <main className="empty">Starting Syncert…</main>;
  if (mode === "setup")
    return (
      <main className="setup">
        <div className="logo">S</div>
        <h1>Private clipboard, everywhere.</h1>
        <p>End-to-end encrypted. Your relay never reads your clipboard.</p>
        <label>
          Relay URL
          <input
            value={relay}
            onChange={(e) => setRelay(e.target.value)}
            placeholder="wss://your-relay.example"
          />
        </label>
        <button className="primary" onClick={() => void setupSpace(false)}>
          Create new space
        </button>
        <div className="divider">or join a space</div>
        <textarea
          value={joinInput}
          onChange={(e) => setJoinInput(e.target.value)}
          placeholder="Paste a syncert1: pairing string"
        />
        <button onClick={() => void setupSpace(true)} disabled={!joinInput}>
          Join existing space
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    );
  return (
    <main>
      <header>
        <div className="brand">
          <span className="logo small">S</span> Syncert
        </div>
        <span className={`status ${status === "synced" ? "online" : ""}`}>
          {status === "synced" ? "Synced" : status}
        </span>
      </header>
      <nav>
        {(["history", "devices", "settings"] as const).map((name) => (
          <button
            onClick={() => {
              setTab(name);
              if (name === "devices") void refreshDevices();
            }}
            className={tab === name ? "selected" : ""}
            key={name}
          >
            {name[0]?.toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "history" && (
        <section>
          <input
            className="search"
            placeholder="Search clipboard history"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="history">
            {filterHistory(history, query).length ? (
              filterHistory(history, query).map((item) => (
                <article key={item.id} onClick={() => void copy(item.text)}>
                  <p>{item.text}</p>
                  <footer>
                    <span>
                      {item.remote ? "Received" : "This device"} ·{" "}
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                    <button
                      title={item.pinned ? "Unpin" : "Pin"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistory(togglePin(history, item.id));
                      }}
                    >
                      {item.pinned ? "★" : "☆"}
                    </button>
                  </footer>
                </article>
              ))
            ) : (
              <div className="empty">
                Copy some text
                <br />
                <span>It will appear here and on your paired devices.</span>
              </div>
            )}
          </div>
          <button className="pause" onClick={() => void togglePause()}>
            {paused ? "▶ Resume syncing" : "Ⅱ Pause syncing"}
          </button>
        </section>
      )}
      {tab === "devices" && (
        <section>
          <h2>Devices in this space</h2>
          <button onClick={() => void refreshDevices()}>Refresh devices</button>
          {devices.map((device) => (
            <div className="row" key={device.deviceId}>
              <span>
                {device.deviceId}
                {device.deviceId === credentials?.deviceId
                  ? " (this device)"
                  : ""}
              </span>
              <button
                onClick={() => {
                  if (
                    transport &&
                    confirm("Remove this device? It will need to pair again.")
                  )
                    void revokeDevice(transport, device.deviceId)
                      .then(refreshDevices)
                      .catch((e: Error) => notify(e.message));
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <hr />
          <h2>Add another device</h2>
          <p className="muted">
            The pairing code contains your encryption key. Share it only with a
            device you trust.
          </p>
          <button onClick={() => void pair()}>Generate pairing code</button>
          {qr && (
            <>
              <img className="qr" src={qr} alt="Device pairing QR code" />
              <textarea
                readOnly
                value={pairing}
                onFocus={(e) => e.target.select()}
              />
            </>
          )}
        </section>
      )}
      {tab === "settings" && (
        <section>
          <h2>Settings</h2>
          <label className="row">
            Launch at login
            <input
              type="checkbox"
              checked={config.launchAtLogin}
              onChange={(e) =>
                void updateConfig({ launchAtLogin: e.target.checked })
              }
            />
          </label>
          <label>
            History shortcut
            <input
              value={config.shortcut}
              onChange={(e) =>
                setConfig({ ...config, shortcut: e.target.value })
              }
              onBlur={() => void updateConfig({ shortcut: config.shortcut })}
            />
          </label>
          <p className="muted">
            Use a shortcut like CommandOrControl+Shift+V. Never share your space
            key.
          </p>
          <label>
            Relay
            <input readOnly value={credentials?.relayUrl} />
          </label>
        </section>
      )}
      {error && (
        <div className="toast" onClick={() => setError("")}>
          {error}
        </div>
      )}
    </main>
  );
}
