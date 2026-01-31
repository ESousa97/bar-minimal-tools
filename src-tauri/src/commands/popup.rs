//! Popup window commands for dropdowns

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::FoldersPopupCooldown;
use crate::PinnedPopups;
use crate::TaskbarState;

fn clamp_to_monitor(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    monitor: &tauri::Monitor,
) -> (f64, f64) {
    let mx = monitor.position().x as f64;
    let my = monitor.position().y as f64;
    let mw = monitor.size().width as f64;
    let mh = monitor.size().height as f64;

    // Keep a small margin from edges.
    let margin = 8.0;

    let min_x = mx + margin;
    let max_x = (mx + mw - width - margin).max(min_x);
    let min_y = my + margin;
    let max_y = (my + mh - height - margin).max(min_y);

    (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

/// Generic popup opener
async fn open_popup(
    app: &AppHandle,
    taskbar_state: &Arc<TaskbarState>,
    pinned_popups: &PinnedPopups,
    popup_name: &str,
    popup_param: &str,
    x: i32,
    y: i32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Position popups relative to the taskbar monitor.
    // Frontend provides x/y in taskbar-window coordinates (0..width), so translate using the
    // current taskbar window origin stored in TaskbarState.
    let (base_x, base_y, _, _) = taskbar_state
        .bounds
        .lock()
        .ok()
        .and_then(|b| *b)
        .unwrap_or((0, 0, 0, 0));

    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Using current_monitor avoids enumerating all monitors on every click.
    let monitor = main_window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No current monitor found")?;

    let desired_x = base_x as f64 + x as f64;
    let desired_y = base_y as f64 + y as f64;
    let (final_x, final_y) = clamp_to_monitor(desired_x, desired_y, width, height, &monitor);

    // Fast-path: reuse existing popup window (no destroy/recreate)
    if let Some(popup) = app.get_webview_window(popup_name) {
        // Toggle behavior: if it's already visible, hide it.
        if popup.is_visible().unwrap_or(false) {
            let _ = popup.hide();
            return Ok(());
        }
        let _ = popup.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: width.round().max(1.0) as u32,
            height: height.round().max(1.0) as u32,
        }));
        let _ = popup.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: final_x.round() as i32,
            y: final_y.round() as i32,
        }));
        // Re-enable interactions (prewarm sets ignore to true while hidden).
        let _ = popup.set_ignore_cursor_events(false);
        let _ = popup.show();
        let _ = popup.set_focus();
        return Ok(());
    }

    // Create popup window with query parameter
    let popup = WebviewWindowBuilder::new(
        app,
        popup_name,
        WebviewUrl::App(format!("/?popup={}", popup_param).into()),
    )
    .title(popup_name)
    .inner_size(width, height)
    .position(final_x, final_y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    // Hide popup when it loses focus (keeps window alive for instant reopen)
    let popup_clone = popup.clone();
    let pinned_set = pinned_popups.set.clone();
    let label = popup_name.to_string();
    popup.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            if pinned_set
                .lock()
                .ok()
                .map(|s| s.contains(&label))
                .unwrap_or(false)
            {
                return;
            }
            let _ = popup_clone.hide();
        }
    });

    Ok(())
}

/// Open the storage popup window
#[tauri::command]
pub async fn open_storage_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "storage-popup",
        "storage",
        x,
        y,
        300.0,
        350.0,
    )
    .await
}

/// Open the CPU popup window
#[tauri::command]
pub async fn open_cpu_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "cpu-popup",
        "cpu",
        x,
        y,
        280.0,
        320.0,
    )
    .await
}

/// Open the RAM popup window
#[tauri::command]
pub async fn open_ram_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "ram-popup",
        "ram",
        x,
        y,
        280.0,
        220.0,
    )
    .await
}

/// Open the GPU popup window
#[tauri::command]
pub async fn open_gpu_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "gpu-popup",
        "gpu",
        x,
        y,
        280.0,
        388.0,
    )
    .await
}

/// Open the Network popup window
#[tauri::command]
pub async fn open_network_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "network-popup",
        "network",
        x,
        y,
        280.0,
        200.0,
    )
    .await
}

/// Open the Audio popup window
#[tauri::command]
pub async fn open_audio_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "audio-popup",
        "audio",
        x,
        y,
        384.0,
        400.0,
    )
    .await
}

/// Open the Headset popup window
#[tauri::command]
pub async fn open_headset_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "headset-popup",
        "headset",
        x,
        y,
        340.0,
        520.0,
    )
    .await
}

/// Open the Calendar popup window
#[tauri::command]
pub async fn open_calendar_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "calendar-popup",
        "calendar",
        x,
        y,
        300.0,
        340.0,
    )
    .await
}

/// Open the Media popup window
#[tauri::command]
pub async fn open_media_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "media-popup",
        "media",
        x,
        y,
        450.0,
        380.0,
    )
    .await
}

/// Open the weather settings popup
#[tauri::command]
pub async fn open_weather_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "weather-popup",
        "weather",
        x,
        y,
        320.0,
        400.0,
    )
    .await
}

/// Open the notes popup window
#[tauri::command]
pub async fn open_notes_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "notes-popup",
        "notes",
        x,
        y,
        520.0,
        420.0,
    )
    .await
}

/// Open the dev color picker popup window
#[tauri::command]
pub async fn open_dev_color_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "dev-color-popup",
        "dev-color",
        x,
        y,
        320.0,
        450.0,
    )
    .await
}

/// Open the task switcher popup window
#[tauri::command]
pub async fn open_taskswitcher_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    open_popup(
        &app,
        &taskbar_state,
        &pinned_popups,
        "taskswitcher-popup",
        "taskswitcher",
        x,
        y,
        400.0,
        500.0,
    )
    .await
}

/// Open the folders (menu-burger) popup window
/// Open the folders popup window (uses same pattern as other popups)
#[tauri::command(rename_all = "camelCase")]
pub async fn open_folders_popup(
    app: AppHandle,
    taskbar_state: State<'_, Arc<TaskbarState>>,
    pinned_popups: State<'_, PinnedPopups>,
    cooldown: State<'_, FoldersPopupCooldown>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // Guard against close->reopen race (Windows click-through after hide).
    const COOLDOWN_MS: u64 = 450;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let ignore_until = cooldown.ignore_until.load(Ordering::SeqCst);
    if now < ignore_until {
        return Ok(());
    }

    let (base_x, base_y, _, _) = taskbar_state
        .bounds
        .lock()
        .ok()
        .and_then(|b| *b)
        .unwrap_or((0, 0, 0, 0));

    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let monitor = main_window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No current monitor found")?;

    let width = 240.0;
    let height = 320.0;

    let desired_x = base_x as f64 + x as f64;
    let desired_y = base_y as f64 + y as f64;
    let (final_x, final_y) = clamp_to_monitor(desired_x, desired_y, width, height, &monitor);

    let cooldown_until = cooldown.ignore_until.clone();

    // On Windows, hiding a top-most popup can allow the same click to "fall through" to the
    // underlying taskbar window (reopening the menu). Temporarily ignoring cursor events
    // on the main window prevents this.
    let ignore_main_for = |app: AppHandle, duration: Duration| {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_ignore_cursor_events(true);
        }
        std::thread::spawn(move || {
            std::thread::sleep(duration);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_ignore_cursor_events(false);
            }
        });
    };

    // Fast-path: reuse existing popup window with explicit cooldown on hide.
    if let Some(popup) = app.get_webview_window("folders-popup") {
        if popup.is_visible().unwrap_or(false) {
            cooldown_until.store(now + COOLDOWN_MS, Ordering::SeqCst);
            ignore_main_for(app.clone(), Duration::from_millis(250));
            let _ = popup.hide();
            return Ok(());
        }

        let _ = popup.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: width.round().max(1.0) as u32,
            height: height.round().max(1.0) as u32,
        }));
        let _ = popup.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: final_x.round() as i32,
            y: final_y.round() as i32,
        }));
        let _ = popup.set_ignore_cursor_events(false);
        let _ = popup.show();
        let _ = popup.set_focus();
        return Ok(());
    }

    // Create popup window
    let popup = WebviewWindowBuilder::new(
        &app,
        "folders-popup",
        WebviewUrl::App("/?popup=folders".into()),
    )
    .title("folders-popup")
    .inner_size(width, height)
    .position(final_x, final_y)
    .decorations(false)
    // IMPORTANT (Windows): keep this popup non-transparent to avoid per-pixel alpha
    // click-through during close animations, which can reopen the menu.
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    // Hide popup when it loses focus, but also set cooldown to avoid immediate reopen.
    let popup_clone = popup.clone();
    let pinned_set = pinned_popups.set.clone();
    let app_for_ignore = app.clone();
    popup.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            // If a popup were ever pinned (unlikely for folders), keep it.
            if pinned_set
                .lock()
                .ok()
                .map(|s| s.contains("folders-popup"))
                .unwrap_or(false)
            {
                return;
            }

            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            cooldown_until.store(now + COOLDOWN_MS, Ordering::SeqCst);

            ignore_main_for(app_for_ignore.clone(), Duration::from_millis(250));

            let _ = popup_clone.hide();
        }
    });

    Ok(())
}

/// Set cooldown on folders popup to prevent immediate reopen after closing
#[tauri::command(rename_all = "camelCase")]
pub fn set_folders_popup_cooldown(
    cooldown: State<'_, FoldersPopupCooldown>,
    duration_ms: u64,
) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    cooldown
        .ignore_until
        .store(now + duration_ms, Ordering::SeqCst);
    Ok(())
}

/// Open the power popup window
#[tauri::command]
pub async fn open_power_popup(
    app: AppHandle,
    _taskbar_state: State<'_, Arc<TaskbarState>>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // Fullscreen modal-style popup on the same monitor as the taskbar.
    // We keep the signature (x/y) for compatibility with the frontend popup API,
    // but positioning is derived from the target monitor.
    let _ = (x, y);

    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let monitor = main_window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No current monitor found")?;

    let screen_size = monitor.size();
    let screen_width = screen_size.width as f64;
    let screen_height = screen_size.height as f64;
    let popup_x = monitor.position().x as f64;
    let popup_y = monitor.position().y as f64;

    // For power popup: always close/destroy existing window first.
    // Fullscreen opaque windows don't hide properly on Windows (causes freeze/white screen).
    if let Some(popup) = app.get_webview_window("power-popup") {
        let _ = popup.close();
    }

    let popup = WebviewWindowBuilder::new(
        &app,
        "power-popup",
        WebviewUrl::App("/?popup=power".into()),
    )
    .title("Energia")
    .inner_size(screen_width, screen_height)
    .position(popup_x, popup_y)
    .decorations(false)
    // Keep consistent with settings-popup: the UI renders its own backdrop and relies
    // on window transparency for the “glass” look.
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    let popup_clone = popup.clone();
    popup.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = popup_clone.close();
        }
    });

    Ok(())
}

/// Open the settings popup (full screen below taskbar)
#[tauri::command(rename_all = "camelCase")]
pub async fn open_settings_popup(
    app: AppHandle,
    _taskbar_state: State<'_, Arc<TaskbarState>>,
    taskbar_height: i32,
) -> Result<(), String> {
    let main_window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let target_monitor = main_window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No current monitor found")?;

    let screen_size = target_monitor.size();
    let screen_width = screen_size.width as f64;
    let screen_height = screen_size.height as f64 - taskbar_height as f64;

    let popup_x = target_monitor.position().x as f64;
    let popup_y = target_monitor.position().y as f64 + taskbar_height as f64;

    // Fast-path: reuse existing popup window
    if let Some(popup) = app.get_webview_window("settings-popup") {
        if popup.is_visible().unwrap_or(false) {
            let _ = popup.hide();
            return Ok(());
        }
        let _ = popup.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: screen_width.round().max(1.0) as u32,
            height: screen_height.round().max(1.0) as u32,
        }));
        let _ = popup.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: popup_x.round() as i32,
            y: popup_y.round() as i32,
        }));
        // Re-enable interactions.
        let _ = popup.set_ignore_cursor_events(false);
        let _ = popup.show();
        let _ = popup.set_focus();
        return Ok(());
    }

    // Create new popup window
    let popup = WebviewWindowBuilder::new(
        &app,
        "settings-popup",
        WebviewUrl::App("/?popup=settings".into()),
    )
    .title("Configurações")
    .inner_size(screen_width, screen_height)
    .position(popup_x, popup_y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .shadow(false)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    let popup_clone = popup.clone();
    popup.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = popup_clone.hide();
        }
    });

    Ok(())
}

/// Close the storage popup window
#[tauri::command]
pub async fn close_storage_popup(app: AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("storage-popup") {
        popup.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Pre-create popup windows hidden/offscreen to eliminate the first-open creation lag.
///
/// This is intentionally best-effort: failures should not break the app.
#[tauri::command]
pub async fn prewarm_popups(app: AppHandle) -> Result<(), String> {
    // Create offscreen and (ideally) invisible so the user never sees a flash.
    let offscreen_x = -10_000.0;
    let offscreen_y = -10_000.0;

    // Note: power-popup is NOT prewarmed because fullscreen opaque windows
    // don't hide properly on Windows; we destroy/recreate it each time.
    let popups: [(&str, &str); 13] = [
        ("cpu-popup", "/?popup=cpu"),
        ("ram-popup", "/?popup=ram"),
        ("gpu-popup", "/?popup=gpu"),
        ("storage-popup", "/?popup=storage"),
        ("network-popup", "/?popup=network"),
        ("audio-popup", "/?popup=audio"),
        ("headset-popup", "/?popup=headset"),
        ("calendar-popup", "/?popup=calendar"),
        ("media-popup", "/?popup=media"),
        ("weather-popup", "/?popup=weather"),
        ("notes-popup", "/?popup=notes"),
        ("settings-popup", "/?popup=settings"),
        ("dev-color-popup", "/?popup=dev-color"),
    ];

    for (label, url) in popups {
        if app.get_webview_window(label).is_some() {
            continue;
        }

        let is_power = label == "power-popup";

        let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
            .title(label)
            .inner_size(1.0, 1.0)
            .position(offscreen_x, offscreen_y)
            .decorations(false)
            .transparent(!is_power)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .shadow(false)
            .resizable(false);

        // `visible(false)` exists in Tauri v2; if it ever changes, the build will
        // catch it. Keeping it here avoids any chance of a visible flash.
        let popup = builder.visible(false).build().map_err(|e| e.to_string())?;

        // Hidden/offscreen popups should never eat clicks.
        let _ = popup.set_ignore_cursor_events(true);

        let popup_clone = popup.clone();
        let pinned_set = app.state::<PinnedPopups>().set.clone();
        let label_s = label.to_string();
        popup.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if pinned_set
                    .lock()
                    .ok()
                    .map(|s| s.contains(&label_s))
                    .unwrap_or(false)
                {
                    return;
                }
                let _ = popup_clone.set_ignore_cursor_events(true);
                let _ = popup_clone.hide();
            }
        });

        let _ = popup.hide();
    }

    Ok(())
}

#[tauri::command]
pub async fn set_popup_pinned(
    app: AppHandle,
    pinned_popups: State<'_, PinnedPopups>,
    popup_name: String,
    pinned: bool,
) -> Result<(), String> {
    let mut set = pinned_popups
        .set
        .lock()
        .map_err(|_| "Pinned lock poisoned".to_string())?;
    if pinned {
        set.insert(popup_name.clone());
    } else {
        set.remove(&popup_name);
    }

    if let Some(popup) = app.get_webview_window(&popup_name) {
        // Ensure it stays interactive when pinned.
        let _ = popup.set_ignore_cursor_events(false);
        let _ = popup.set_always_on_top(true);
    }

    Ok(())
}

#[tauri::command]
pub fn get_popup_pinned(
    pinned_popups: State<'_, PinnedPopups>,
    popup_name: String,
) -> Result<bool, String> {
    let set = pinned_popups
        .set
        .lock()
        .map_err(|_| "Pinned lock poisoned".to_string())?;
    Ok(set.contains(&popup_name))
}
