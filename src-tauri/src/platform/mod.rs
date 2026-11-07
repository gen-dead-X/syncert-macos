#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/** Clipboard sources can mark passwords and one-time clipboard data as private. */
pub fn is_sensitive_clipboard() -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::is_sensitive_clipboard();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::is_sensitive_clipboard();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}
