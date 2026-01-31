//! System data Tauri commands

use crate::services::{cpu, ram, gpu, storage, WmiService};
use crate::services::network;
use serde::Serialize;
use tauri::State;
use std::sync::Arc;

#[cfg(windows)]
use tauri::Manager;

#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
fn is_explorer_running() -> bool {
    // Best-effort check. If tasklist fails, assume false so we retry starting.
    let out = match Command::new("tasklist.exe")
        .args(["/FI", "IMAGENAME eq explorer.exe", "/NH"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return false,
    };

    let text = String::from_utf8_lossy(&out.stdout);
    // When not running, tasklist typically returns something like:
    // "INFO: No tasks are running which match the specified criteria."
    text.to_ascii_lowercase().contains("explorer.exe")
}

#[cfg(windows)]
fn is_windows_11_or_newer() -> bool {
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;

    unsafe {
        let mut info = OSVERSIONINFOW {
            dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
            ..Default::default()
        };

        // RtlGetVersion is the reliable way to get the real build number.
        // windows-rs doesn't always expose it across feature sets, so load dynamically.
        type RtlGetVersionFn = unsafe extern "system" fn(*mut OSVERSIONINFOW) -> i32; // NTSTATUS

        let lib = match libloading::Library::new("ntdll.dll") {
            Ok(l) => l,
            Err(_) => return false,
        };

        let func: libloading::Symbol<RtlGetVersionFn> = match lib.get(b"RtlGetVersion") {
            Ok(f) => f,
            Err(_) => return false,
        };

        let status = func(&mut info as *mut _);
        if status == 0 {
            // Windows 11 starts at build 22000.
            info.dwBuildNumber >= 22000
        } else {
            false
        }
    }
}

#[cfg(windows)]
fn send_win_shortcut(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN, VIRTUAL_KEY,
    };

    let win_vk: VIRTUAL_KEY = VK_LWIN;

    unsafe {
        let inputs: [INPUT; 4] = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: win_vk,
                        wScan: 0,
                        dwFlags: Default::default(),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: Default::default(),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: vk,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: win_vk,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];

        let sent = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        if sent != inputs.len() as u32 {
            return Err(format!("SendInput sent {sent}/{} events", inputs.len()));
        }
    }

    Ok(())
}
#[derive(Serialize)]
pub struct SystemSnapshot {
    pub cpu: cpu::CpuData,
    pub ram: ram::RamData,
    pub gpu: gpu::GpuData,
    pub storage: storage::StorageData,
    pub timestamp: i64,
}

/// Get a complete system snapshot with all hardware data (using cached WMI data)
#[tauri::command]
pub async fn get_system_snapshot(wmi_service: State<'_, Arc<WmiService>>) -> Result<SystemSnapshot, String> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let cached = wmi_service.get_cached_data();
    
    Ok(SystemSnapshot {
        cpu: cpu::get_cpu_info_cached(&cached),
        ram: ram::get_ram_info_cached(&cached),
        gpu: gpu::get_gpu_info_cached(&cached),
        storage: storage::get_storage_info_cached(&cached),
        timestamp,
    })
}

/// Get CPU data only
#[tauri::command]
pub async fn get_cpu_data(wmi_service: State<'_, Arc<WmiService>>) -> Result<cpu::CpuData, String> {
    let cached = wmi_service.get_cached_data();
    Ok(cpu::get_cpu_info_cached(&cached))
}

/// Get RAM data only
#[tauri::command]
pub async fn get_ram_data(wmi_service: State<'_, Arc<WmiService>>) -> Result<ram::RamData, String> {
    let cached = wmi_service.get_cached_data();
    Ok(ram::get_ram_info_cached(&cached))
}

/// Get GPU data only
#[tauri::command]
pub async fn get_gpu_data(wmi_service: State<'_, Arc<WmiService>>) -> Result<gpu::GpuData, String> {
    let cached = wmi_service.get_cached_data();
    Ok(gpu::get_gpu_info_cached(&cached))
}

/// Get storage data only
#[tauri::command]
pub async fn get_storage_data(wmi_service: State<'_, Arc<WmiService>>) -> Result<storage::StorageData, String> {
    let cached = wmi_service.get_cached_data();
    Ok(storage::get_storage_info_cached(&cached))
}

/// Get network data only
#[tauri::command]
pub async fn get_network_data(wmi_service: State<'_, Arc<WmiService>>) -> Result<network::NetworkData, String> {
    let cached = wmi_service.get_cached_data();
    Ok(network::get_network_info_cached(&cached.network))
}

/// Best-effort: return the number of notifications currently present in the Windows
/// Notification Center / Action Center.
///
/// Notes:
/// - Windows does not provide a simple "unread" counter for classic desktop apps.
/// - This uses WinRT `UserNotificationListener` which may require user permission.
/// - If permission/API is unavailable, returns `Ok(None)` so the UI can stay neutral.
#[tauri::command]
pub async fn get_unread_notification_count() -> Result<Option<u32>, String> {
    #[cfg(windows)]
    {
        use windows::UI::Notifications::{NotificationKinds};
        use windows::UI::Notifications::Management::{
            UserNotificationListener, UserNotificationListenerAccessStatus,
        };

        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(_) => return Ok(None),
        };

        let status = match listener.RequestAccessAsync() {
            Ok(op) => match op.get() {
                Ok(s) => s,
                Err(_) => return Ok(None),
            },
            Err(_) => return Ok(None),
        };

        if status != UserNotificationListenerAccessStatus::Allowed {
            return Ok(None);
        }

        let kinds = NotificationKinds::Toast;
        let list = match listener.GetNotificationsAsync(kinds) {
            Ok(op) => match op.get() {
                Ok(v) => v,
                Err(_) => return Ok(None),
            },
            Err(_) => return Ok(None),
        };

        let count = list.Size().unwrap_or(0);
        Ok(Some(count))
    }

    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

#[cfg(windows)]
fn run_process(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Shutdown the machine immediately (Windows).
#[tauri::command]
pub fn system_shutdown() -> Result<(), String> {
    #[cfg(windows)]
    {
        return run_process("shutdown.exe", &["/s", "/t", "0"]);
    }

    #[cfg(not(windows))]
    {
        Err("system_shutdown is only supported on Windows".into())
    }
}

/// Restart the machine immediately (Windows).
#[tauri::command]
pub fn system_restart() -> Result<(), String> {
    #[cfg(windows)]
    {
        return run_process("shutdown.exe", &["/r", "/t", "0"]);
    }

    #[cfg(not(windows))]
    {
        Err("system_restart is only supported on Windows".into())
    }
}

/// Sign out the current user session (Windows).
#[tauri::command]
pub fn system_sign_out() -> Result<(), String> {
    #[cfg(windows)]
    {
        return run_process("shutdown.exe", &["/l"]);
    }

    #[cfg(not(windows))]
    {
        Err("system_sign_out is only supported on Windows".into())
    }
}

/// Lock the workstation (Windows).
#[tauri::command]
pub fn system_lock() -> Result<(), String> {
    #[cfg(windows)]
    {
        // Prefer a simple, dependency-free call that works across Windows versions.
        // This avoids windows-rs feature/binding differences for LockWorkStation.
        return run_process("rundll32.exe", &["user32.dll,LockWorkStation"]);
    }

    #[cfg(not(windows))]
    {
        Err("system_lock is only supported on Windows".into())
    }
}

/// Restart Windows Explorer (best-effort). Useful when the shell is stuck.
#[tauri::command]
pub fn system_restart_explorer() -> Result<(), String> {
    #[cfg(windows)]
    {
        // Kill explorer, then start it again.
        // IMPORTANT: wait for taskkill to finish; otherwise it can kill the newly
        // started explorer.exe too (looks like it only terminates).
        let _ = Command::new("taskkill.exe")
            // Do NOT use `/t` (process tree). It can kill unrelated processes that happen
            // to be children of Explorer and make our app exit (leading to tray-icon cleanup errors).
            .args(["/f", "/im", "explorer.exe"])
            .status();

        // Give the shell a moment to fully exit before restarting.
        std::thread::sleep(std::time::Duration::from_millis(900));

        // Try a few times; on some systems Explorer takes a moment to come back.
        for _ in 0..5 {
            if is_explorer_running() {
                return Ok(());
            }

            // Primary: use cmd start (detaches properly).
            let _ = run_process("cmd.exe", &["/c", "start", "", "explorer.exe"]);

            std::thread::sleep(std::time::Duration::from_millis(800));
            if is_explorer_running() {
                return Ok(());
            }

            // Fallback: PowerShell Start-Process (works in some locked-down shells).
            let _ = run_process(
                "powershell.exe",
                &[
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    "Start-Process explorer.exe",
                ],
            );

            std::thread::sleep(std::time::Duration::from_millis(900));
        }

        // Best-effort: even if we can't confirm, we attempted restart.
        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("system_restart_explorer is only supported on Windows".into())
    }
}

/// Open Task Manager (Windows).
#[tauri::command]
pub fn open_task_manager() -> Result<(), String> {
    #[cfg(windows)]
    {
        return run_process("taskmgr.exe", &[]);
    }

    #[cfg(not(windows))]
    {
        Err("open_task_manager is only supported on Windows".into())
    }
}

/// Quit the Bar app (with AppBar cleanup).
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(hwnd) = window.hwnd() {
                let _ = crate::services::unregister_appbar(hwnd.0 as isize);
            }
        }
    }

    // Avoid tearing down the WebView while the command IPC is still completing.
    // This reduces noisy Chromium shutdown logs like:
    // "Failed to unregister class Chrome_WidgetWin_0. Error = 1412".
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        std::thread::sleep(std::time::Duration::from_millis(75));
        app_handle.exit(0);
    });

    Ok(())
}

/// Open the Windows notifications panel.
///
/// - Windows 11: Win+N opens Notification Center (sidebar)
/// - Windows 10: Win+A opens Action Center
///
/// Windows does not expose a supported public API to embed the Notification Center inside
/// a custom window; we trigger the native UI.
#[tauri::command]
pub fn open_notification_center() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY;

        // VK codes: 'N' = 0x4E, 'A' = 0x41
        let (vk_n, vk_a) = (VIRTUAL_KEY(0x4E), VIRTUAL_KEY(0x41));
        if is_windows_11_or_newer() {
            // Win+N
            send_win_shortcut(vk_n)
        } else {
            // Win+A
            send_win_shortcut(vk_a)
        }
    }

    #[cfg(not(windows))]
    {
        Ok(())
    }
}
