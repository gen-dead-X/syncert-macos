pub fn is_sensitive_clipboard() -> bool {
    // ExcludeClipboardContentFromMonitorProcessing is a Windows clipboard format
    // set by cooperating source applications (Windows 10 1709+).
    unsafe {
        windows_sys::Win32::System::DataExchange::IsClipboardFormatAvailable(
            windows_sys::Win32::System::DataExchange::RegisterClipboardFormatW(
                windows_sys::core::w!("ExcludeClipboardContentFromMonitorProcessing"),
            ) as u32,
        ) != 0
    }
}
