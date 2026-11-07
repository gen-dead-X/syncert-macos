mod platform;

use base64::{engine::general_purpose::STANDARD, Engine};
use keyring::Entry;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const SERVICE: &str = "com.syncert.desktop";
struct Settings {
    paused: Mutex<bool>,
}
#[derive(Serialize, Clone)]
struct ClipboardSnapshot {
    text: Option<String>,
    sensitive: bool,
}

fn secret_key(key: &str) -> Result<Entry, String> {
    if !["spaceKey", "deviceToken"].contains(&key) {
        return Err("invalid secret name".into());
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}
#[tauri::command]
fn store_secret(key: String, value: String) -> Result<(), String> {
    secret_key(&key)?
        .set_password(&value)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn load_secret(key: String) -> Result<Option<String>, String> {
    match secret_key(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
fn delete_secret(key: String) -> Result<(), String> {
    match secret_key(&key)?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
#[tauri::command]
fn read_clipboard() -> ClipboardSnapshot {
    ClipboardSnapshot {
        text: None,
        sensitive: platform::is_sensitive_clipboard(),
    }
}
#[tauri::command]
fn clipboard_is_sensitive() -> bool {
    platform::is_sensitive_clipboard()
}
#[tauri::command]
fn set_paused(paused: bool, state: State<'_, Settings>) -> Result<(), String> {
    *state.paused.lock().map_err(|_| "settings lock")? = paused;
    Ok(())
}
#[tauri::command]
fn toggle_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
#[tauri::command]
async fn set_shortcut(shortcut: String, app: AppHandle) -> Result<(), String> {
    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|_| "invalid shortcut".to_string())?;
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    app.global_shortcut()
        .register(parsed)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn autostart(enabled: bool, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Settings {
            paused: Mutex::new(false),
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("toggle-history", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            store_secret,
            load_secret,
            delete_secret,
            read_clipboard,
            clipboard_is_sensitive,
            set_paused,
            toggle_window,
            set_shortcut,
            autostart
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let quit = MenuItem::with_id(app, "quit", "Quit Syncert", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let icon = Image::new(&[0, 0, 0, 255], 1, 1);
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Syncert — encrypted clipboard sync")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, tauri::tray::TrayIconEvent::Click { .. }) {
                        let _ = tray.app_handle().emit("toggle-history", ());
                    }
                })
                .build(app)?;
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);
            app.global_shortcut().register(shortcut)?;
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Syncert");
}
