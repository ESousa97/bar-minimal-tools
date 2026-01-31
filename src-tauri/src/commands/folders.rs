//! Commands for folder shortcuts management

use crate::commands::config::{FolderShortcut, FolderShortcutsConfig};
use crate::FoldersPopupCooldown;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// Get folder shortcuts from active profile
#[tauri::command]
pub fn get_folder_shortcuts() -> Result<FolderShortcutsConfig, String> {
    let config = super::config::get_active_profile()?;
    Ok(config.folder_shortcuts)
}

/// Save folder shortcuts to active profile
#[tauri::command]
pub fn save_folder_shortcuts(shortcuts: FolderShortcutsConfig) -> Result<(), String> {
    let mut config = super::config::get_active_profile()?;
    config.folder_shortcuts = shortcuts;
    super::config::save_current_profile(config)
}

/// Add a new folder shortcut
#[tauri::command]
pub fn add_folder_shortcut(shortcut: FolderShortcut) -> Result<(), String> {
    let mut config = super::config::get_active_profile()?;
    
    // Check for duplicate ID
    if config.folder_shortcuts.shortcuts.iter().any(|s| s.id == shortcut.id) {
        return Err("Folder shortcut with this ID already exists".to_string());
    }
    
    config.folder_shortcuts.shortcuts.push(shortcut);
    super::config::save_current_profile(config)
}

/// Remove a folder shortcut by ID
#[tauri::command]
pub fn remove_folder_shortcut(id: String) -> Result<(), String> {
    let mut config = super::config::get_active_profile()?;
    config.folder_shortcuts.shortcuts.retain(|s| s.id != id);
    super::config::save_current_profile(config)
}

/// Update a folder shortcut
#[tauri::command]
pub fn update_folder_shortcut(shortcut: FolderShortcut) -> Result<(), String> {
    let mut config = super::config::get_active_profile()?;
    
    if let Some(existing) = config.folder_shortcuts.shortcuts.iter_mut().find(|s| s.id == shortcut.id) {
        *existing = shortcut;
        super::config::save_current_profile(config)
    } else {
        Err("Folder shortcut not found".to_string())
    }
}

/// Open a folder in Windows Explorer
#[tauri::command]
pub fn open_folder(
    app: AppHandle,
    cooldown: State<'_, FoldersPopupCooldown>,
    path: String,
) -> Result<(), String> {
    // Prevent the folders menu from immediately reopening due to Windows click-through
    // when the Explorer window steals focus.
    const COOLDOWN_MS: u64 = 1500;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    cooldown.ignore_until.store(now + COOLDOWN_MS, Ordering::SeqCst);

    // Hide the folders popup immediately (don't rely on the frontend exit animation).
    if let Some(popup) = app.get_webview_window("folders-popup") {
        let _ = popup.hide();
    }

    // Briefly ignore cursor events on the main window so the click that triggered this
    // can't land on the underlying menu button and reopen the popup.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_ignore_cursor_events(true);
    }
    let app_for_reset = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(350));
        if let Some(main) = app_for_reset.get_webview_window("main") {
            let _ = main.set_ignore_cursor_events(false);
        }
    });

    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    Ok(())
}

/// Verify if a folder path exists
#[tauri::command]
pub fn verify_folder_path(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}
