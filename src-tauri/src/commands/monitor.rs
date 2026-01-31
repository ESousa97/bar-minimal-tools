//! Monitor management Tauri commands

use serde::Serialize;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use crate::services::appbar;
use crate::TaskbarState;

fn verbose_logs_enabled() -> bool {
    std::env::var_os("BAR_VERBOSE_LOGS").is_some()
}

#[derive(Serialize, Clone, Debug)]
pub struct MonitorInfo {
    /// Monitor ID (for selection)
    pub id: String,
    /// Monitor name
    pub name: String,
    /// Whether this is the primary monitor
    pub is_primary: bool,
    /// Monitor width in pixels
    pub width: u32,
    /// Monitor height in pixels
    pub height: u32,
    /// Monitor X position
    pub x: i32,
    /// Monitor Y position
    pub y: i32,
    /// Scale factor (DPI)
    pub scale_factor: f64,
}

fn list_monitors_for(window: &WebviewWindow) -> Vec<MonitorInfo> {
    let monitors = window.available_monitors().unwrap_or_default();
    let primary = window.primary_monitor().ok().flatten();

    monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let name = m.name().cloned().unwrap_or_else(|| format!("Monitor {}", i + 1));
            let is_primary = primary
                .as_ref()
                .map(|p| p.name() == m.name())
                .unwrap_or(false);

            // Stable id: based on monitor position + size (enumeration order can differ between windows)
            let stable_id = format!(
                "{}:{}:{}:{}",
                m.position().x,
                m.position().y,
                m.size().width,
                m.size().height
            );

            MonitorInfo {
                id: stable_id,
                name,
                is_primary,
                width: m.size().width,
                height: m.size().height,
                x: m.position().x,
                y: m.position().y,
                scale_factor: m.scale_factor(),
            }
        })
        .collect()
}

/// List all available monitors
#[tauri::command]
pub fn list_monitors(window: WebviewWindow) -> Vec<MonitorInfo> {
    list_monitors_for(&window)
}

/// Set the taskbar to display on a specific monitor and register as AppBar
#[tauri::command(rename_all = "camelCase")]
pub fn set_taskbar_monitor(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    monitor_id: String, 
    bar_height: Option<u32>
) -> Result<(), String> {
    if verbose_logs_enabled() {
        eprintln!(
            "set_taskbar_monitor called: monitor_id={}, bar_height={:?}",
            monitor_id, bar_height
        );
    }

    struct TransitionGuard<'a> {
        flag: &'a std::sync::atomic::AtomicBool,
    }
    impl Drop for TransitionGuard<'_> {
        fn drop(&mut self) {
            self.flag.store(false, Ordering::SeqCst);
        }
    }

    taskbar_state.appbar_transition.store(true, Ordering::SeqCst);
    let _guard = TransitionGuard {
        flag: &taskbar_state.appbar_transition,
    };

    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let monitors = list_monitors_for(&window);
    let target = monitors.iter().find(|m| m.id == monitor_id);

    // Backward-compat for older configs that stored "monitor_0" style ids
    let target = if let Some(target) = target {
        target
    } else if let Some(idx_str) = monitor_id.strip_prefix("monitor_") {
        let idx = idx_str.parse::<usize>().map_err(|_| "Monitor not found")?;
        monitors.get(idx).ok_or("Monitor not found")?
    } else {
        return Err("Monitor not found".to_string());
    };
    
    let height = bar_height.unwrap_or(28);
    
    if verbose_logs_enabled() {
        eprintln!(
            "Target monitor found: {} at ({}, {}) size {}x{}",
            target.name, target.x, target.y, target.width, target.height
        );
    }
    
    // Position the window at the top of the target monitor
    window.set_position(PhysicalPosition::new(target.x, target.y))
        .map_err(|e| e.to_string())?;
    
    // Set the window size to span the full width of the monitor
    window.set_size(PhysicalSize::new(target.width, height))
        .map_err(|e| e.to_string())?;
    
    // Update shared state with new bounds
    if let Ok(mut bounds) = taskbar_state.bounds.lock() {
        *bounds = Some((target.x, target.y, target.width, height));
        if verbose_logs_enabled() {
            eprintln!(
                "Updated taskbar_state.bounds to ({}, {}, {}, {})",
                target.x, target.y, target.width, height
            );
        }
    }
    
    // Register/update AppBar to reserve screen space on the selected monitor
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            let result = appbar::register_appbar(
                hwnd.0 as isize,
                target.x,
                target.y,
                target.width as i32,
                height as i32,
            );
            if verbose_logs_enabled() {
                eprintln!(
                    "AppBar register result: {:?} - moved to monitor {} at ({}, {}) size {}x{}",
                    result,
                    monitor_id,
                    target.x,
                    target.y,
                    target.width,
                    height
                );
            }

            // If registration failed, return an error so the UI can retry or surface it.
            result.map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

/// Unregister the AppBar when closing
#[tauri::command]
pub fn unregister_taskbar_appbar(window: tauri::Window) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            appbar::unregister_appbar(hwnd.0 as isize)?;
        }
    }
    Ok(())
}

/// Preview taskbar height changes in real time without re-registering the AppBar.
/// This is used by Settings UI while the user drags the height slider.
#[tauri::command(rename_all = "camelCase")]
pub fn preview_taskbar_height(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    bar_height: u32,
    update_appbar: Option<bool>,
) -> Result<(), String> {
    struct TransitionGuard<'a> {
        flag: &'a std::sync::atomic::AtomicBool,
    }
    impl Drop for TransitionGuard<'_> {
        fn drop(&mut self) {
            self.flag.store(false, Ordering::SeqCst);
        }
    }

    taskbar_state.appbar_transition.store(true, Ordering::SeqCst);
    let _guard = TransitionGuard {
        flag: &taskbar_state.appbar_transition,
    };

    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Use last known taskbar bounds, fallback to current window metrics.
    let (x, y, width) = taskbar_state
        .bounds
        .lock()
        .ok()
        .and_then(|b| *b)
        .map(|(x, y, w, _h)| (x, y, w))
        .or_else(|| {
            let pos = window.outer_position().ok()?;
            let size = window.outer_size().ok()?;
            Some((pos.x, pos.y, size.width))
        })
        .unwrap_or((0, 0, 800));

    window
        .set_size(PhysicalSize::new(width, bar_height))
        .map_err(|e| e.to_string())?;

    if let Ok(mut bounds) = taskbar_state.bounds.lock() {
        *bounds = Some((x, y, width, bar_height));
    }

    let should_update_appbar = update_appbar.unwrap_or(false);
    if should_update_appbar {
        #[cfg(windows)]
        {
            if let Ok(hwnd) = window.hwnd() {
                appbar::update_appbar_position(
                    hwnd.0 as isize,
                    x,
                    y,
                    width as i32,
                    bar_height as i32,
                )?;
            }
        }
    }

    Ok(())
}
