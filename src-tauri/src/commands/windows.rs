//! Commands for window management (Task Switcher)

use crate::services::windows::{self, WindowInfo, WindowList};

/// Get list of all visible windows
#[tauri::command]
pub fn get_window_list() -> WindowList {
    windows::get_window_list()
}

/// Get the currently focused window
#[tauri::command]
pub fn get_foreground_window() -> Option<WindowInfo> {
    windows::get_foreground_window()
}

/// Focus a specific window by HWND
#[tauri::command]
pub fn focus_window(hwnd: isize) -> Result<(), String> {
    windows::focus_window(hwnd)
}

/// Get icon for a process (returns base64 encoded PNG)
#[tauri::command]
pub fn get_process_icon(process_path: String) -> Option<String> {
    windows::get_process_icon(&process_path)
}
