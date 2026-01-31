pub mod commands;
pub mod services;

use commands::{system, config, monitor, popup, audio, headset, media, weather, notes, folders, startup, windows};
use services::WmiService;
use std::collections::HashSet;
use std::sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

/// Shared state for taskbar position management
pub struct TaskbarState {
    pub bounds: Mutex<Option<(i32, i32, u32, u32)>>,
    pub fullscreen_hidden: AtomicBool,
    /// When true, background watchers should not register/unregister the AppBar.
    pub appbar_transition: AtomicBool,
}

/// Shared state to keep certain popups open even when they lose focus.
///
/// Used for the Notes popup "Fixar" behavior.
pub struct PinnedPopups {
    pub set: Arc<Mutex<HashSet<String>>>,
}

/// Cooldown state for folders popup to prevent close-then-reopen race conditions.
pub struct FoldersPopupCooldown {
    /// Timestamp (ms since UNIX epoch) until which open requests should be ignored.
    pub ignore_until: Arc<AtomicU64>,
}

impl Default for FoldersPopupCooldown {
    fn default() -> Self {
        Self {
            ignore_until: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl Default for PinnedPopups {
    fn default() -> Self {
        Self {
            set: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}

impl Default for TaskbarState {
    fn default() -> Self {
        Self {
            bounds: Mutex::new(None),
            fullscreen_hidden: AtomicBool::new(false),
            appbar_transition: AtomicBool::new(false),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize WMI service once at startup
    let wmi_service = Arc::new(WmiService::new());
    let taskbar_state = Arc::new(TaskbarState::default());
    let pinned_popups = PinnedPopups::default();
    let folders_popup_cooldown = FoldersPopupCooldown::default();


    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init());

    // In dev, it's common to have a previous instance still running in the tray.
    // Disabling single-instance there avoids the new process immediately exiting
    // (and producing noisy Chromium teardown logs).
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when trying to open another instance
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .manage(wmi_service)
        .manage(taskbar_state.clone())
        .manage(pinned_popups)
        .manage(folders_popup_cooldown)
        .invoke_handler(tauri::generate_handler![
            // System commands
            system::get_system_snapshot,
            system::get_cpu_data,
            system::get_ram_data,
            system::get_gpu_data,
            system::get_storage_data,
            system::get_network_data,
            system::open_notification_center,
            system::get_unread_notification_count,
            system::system_shutdown,
            system::system_restart,
            system::system_lock,
            system::system_sign_out,
            system::system_restart_explorer,
            system::open_task_manager,
            system::quit_app,
            // Monitor commands
            monitor::list_monitors,
            monitor::set_taskbar_monitor,
            monitor::preview_taskbar_height,
            monitor::unregister_taskbar_appbar,
            // Config commands
            config::list_profiles,
            config::create_profile,
            config::switch_profile,
            config::save_current_profile,
            config::export_profile,
            config::import_profile,
            config::get_active_profile,
            config::save_weather_config,
            config::get_weather_config,
            config::factory_reset,
            // Audio commands
            audio::get_audio_data,
            audio::set_master_volume,
            audio::adjust_master_volume,
            audio::toggle_mute,
            audio::set_device_volume,
            audio::set_default_audio_device,
            // Headset commands
            headset::get_headset_data,
            headset::check_icue_sdk,
            headset::install_icue_sdk,
            headset::get_icue_setup_instructions,
            // Media commands
            media::get_media_data,
            media::media_play_pause,
            media::media_next,
            media::media_previous,
            media::media_seek,
            // Weather commands
            weather::get_weather,
            weather::get_weather_icon_url,
            weather::get_current_location,
            // Popup commands
            popup::open_storage_popup,
            popup::open_cpu_popup,
            popup::open_ram_popup,
            popup::open_gpu_popup,
            popup::open_network_popup,
            popup::open_audio_popup,
            popup::open_headset_popup,
            popup::open_calendar_popup,
            popup::open_media_popup,
            popup::open_weather_popup,
            popup::open_settings_popup,
            popup::open_power_popup,
            popup::open_notes_popup,
            popup::open_folders_popup,
            popup::open_dev_color_popup,
            popup::open_taskswitcher_popup,
            popup::close_storage_popup,
            popup::prewarm_popups,
            popup::set_popup_pinned,
            popup::get_popup_pinned,
            popup::set_folders_popup_cooldown,

            // Notes commands
            notes::list_notes,
            notes::create_note,
            notes::update_note,
            notes::delete_note,

            // Folders commands
            folders::get_folder_shortcuts,
            folders::save_folder_shortcuts,
            folders::add_folder_shortcut,
            folders::remove_folder_shortcut,
            folders::update_folder_shortcut,
            folders::open_folder,
            folders::verify_folder_path,

            // Startup (Windows startup folder .bat)
            startup::startup_is_enabled,
            startup::startup_enable,
            startup::startup_disable,
            startup::is_running_as_admin,

            // Windows/Task Switcher commands
            windows::get_window_list,
            windows::get_foreground_window,
            windows::focus_window,
            windows::get_process_icon,
        ])
        .setup(move |app| {
            // Setup system tray
            let show_item = MenuItem::with_id(app, "show", "Mostrar/Ocultar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            
            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Bar Minimal Tools")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "quit" => {
                            // Unregister AppBar before quitting
                            #[cfg(windows)]
                            if let Some(window) = app.get_webview_window("main") {
                                if let Ok(hwnd) = window.hwnd() {
                                    let _ = services::unregister_appbar(hwnd.0 as isize);
                                }
                            }
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                std::thread::sleep(Duration::from_millis(75));
                                app_handle.exit(0);
                            });
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Keep the tray icon alive for the lifetime of the app.
            // If the handle is dropped, the tray icon is removed and in some cases the app may exit
            // when the main window is hidden (e.g., fullscreen auto-hide).
            app.manage(tray);

            // Register AppBar on startup with a small delay to ensure window is ready
            #[cfg(windows)]
            {
                use tauri::PhysicalPosition;
                use tauri::PhysicalSize;
                
                let bar_height: i32 = 32; // Fixed height for the bar
                let (screen_width, _) = services::get_primary_screen_size();
                let verbose_logs_enabled = std::env::var_os("BAR_VERBOSE_LOGS").is_some();
                if let Some(window) = app.get_webview_window("main") {
                    // Enforce fixed position at (0,0) to prevent movement
                    let win_clone = window.clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::Moved(pos) = event {
                            if pos.x != 0 || pos.y != 0 {
                                let _ = win_clone.set_position(PhysicalPosition::new(0, 0));
                            }
                        }
                    });

                    // Persist initial bounds so we can restore user placement
                    if let Ok(pos) = window.outer_position() {
                        if let Ok(size) = window.outer_size() {
                            if let Ok(mut bounds) = taskbar_state.bounds.lock() {
                                *bounds = Some((pos.x, pos.y, size.width, size.height));
                            }
                        }
                    }

                    // Set window position and size to full screen width
                    let _ = window.set_position(PhysicalPosition::new(0, 0));
                    let _ = window.set_size(PhysicalSize::new(screen_width as u32, bar_height as u32));
                    
                    // Log actual window size after setting
                    if let Ok(size) = window.outer_size() {
                        if verbose_logs_enabled {
                            eprintln!("Window actual size: {}x{}", size.width, size.height);
                        }
                    }
                    if let Ok(pos) = window.outer_position() {
                        if verbose_logs_enabled {
                            eprintln!("Window actual position: ({}, {})", pos.x, pos.y);
                        }
                    }
                    
                    let state_for_register = taskbar_state.clone();
                    let win = window.clone();
                    
                    // Spawn a task with a small delay to ensure window is fully created
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(500));
                        
                        if let Ok(hwnd) = win.hwnd() {
                            let _ = services::register_appbar(
                                hwnd.0 as isize,
                                0,
                                0,
                                screen_width,
                                bar_height,
                            );
                            if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
                                if let Ok(mut bounds) = state_for_register.bounds.lock() {
                                    *bounds = Some((pos.x, pos.y, size.width, size.height));
                                }
                            }
                            state_for_register.fullscreen_hidden.store(false, Ordering::SeqCst);
                        }
                    });
                }

                // Watch for foreground fullscreen apps to auto-hide the bar
                if let Some(window) = app.get_webview_window("main") {
                    let state_for_watcher = taskbar_state.clone();
                    let watch_window = window.clone();
                    std::thread::spawn(move || {
                        loop {
                            // Avoid racing AppBar operations while changing monitors or re-registering.
                            if state_for_watcher.appbar_transition.load(Ordering::SeqCst) {
                                std::thread::sleep(Duration::from_millis(200));
                                continue;
                            }

                            if let Ok(hwnd) = watch_window.hwnd() {
                                let hwnd_val = hwnd.0 as isize;
                                let is_fullscreen = services::is_foreground_fullscreen(hwnd_val);
                                let was_hidden = state_for_watcher.fullscreen_hidden.load(Ordering::SeqCst);
                                if is_fullscreen && !was_hidden {
                                    #[cfg(debug_assertions)]
                                    if verbose_logs_enabled {
                                        eprintln!("Auto-hide: fullscreen detected, hiding bar + unregistering AppBar");
                                    }
                                    if let (Ok(pos), Ok(size)) = (watch_window.outer_position(), watch_window.outer_size()) {
                                        if let Ok(mut bounds) = state_for_watcher.bounds.lock() {
                                            *bounds = Some((pos.x, pos.y, size.width, size.height));
                                        }
                                    }
                                    state_for_watcher.fullscreen_hidden.store(true, Ordering::SeqCst);
                                    let _ = watch_window.hide();
                                    let _ = services::unregister_appbar(hwnd_val);
                                } else if !is_fullscreen && was_hidden {
                                    #[cfg(debug_assertions)]
                                    if verbose_logs_enabled {
                                        eprintln!("Auto-show: leaving fullscreen, showing bar + registering AppBar");
                                    }
                                    state_for_watcher.fullscreen_hidden.store(false, Ordering::SeqCst);
                                    let fallback_size = watch_window.outer_size().ok();
                                    let (x, y, width, height) = state_for_watcher.bounds
                                        .lock()
                                        .ok()
                                        .and_then(|b| *b)
                                        .or_else(|| fallback_size.map(|s| (0, 0, s.width, s.height)))
                                        .unwrap_or((0, 0, 800, bar_height as u32));
                                    let _ = watch_window.set_position(PhysicalPosition::new(x, y));
                                    let _ = watch_window.set_size(PhysicalSize::new(width, height));
                                    let _ = watch_window.show();
                                    let _ = services::register_appbar(
                                        hwnd_val,
                                        x,
                                        y,
                                        width as i32,
                                        height as i32,
                                    );
                                }
                            }
                            std::thread::sleep(Duration::from_millis(800));
                        }
                    });
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(debug_assertions)]
            if std::env::var_os("BAR_VERBOSE_LOGS").is_some() {
                eprintln!("Window event: label={} event={:?}", window.label(), event);
            }

            // Unregister AppBar when the *main bar window* is closing.
            // Popups may close frequently (e.g., focus loss) and must not affect AppBar state.
            if window.label() != "main" {
                return;
            }

            if let tauri::WindowEvent::CloseRequested { .. } = event {
                #[cfg(windows)]
                {
                    if let Ok(hwnd) = window.hwnd() {
                        let _ = services::unregister_appbar(hwnd.0 as isize);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
