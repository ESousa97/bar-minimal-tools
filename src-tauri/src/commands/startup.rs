//! Windows startup via .bat file in shell:startup folder
//
// Why this approach:
// - Using a simple .bat in the Startup folder is less likely to trigger antivirus false positives
// - The .bat just launches the app normally
// - The app manifest uses asInvoker, so Windows shows a UAC prompt if elevation is needed
// - If the user declines UAC, the app runs with limited privileges (no admin features)
// - This is more transparent and user-friendly than Scheduled Tasks

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use tauri::AppHandle;

const BAT_FILENAME: &str = "BarMinimalTools.bat";
const LEGACY_TASK_NAME: &str = "BarMinimalTools";

/// Remove legacy scheduled task if it exists (from previous versions)
#[cfg(windows)]
fn cleanup_legacy_scheduled_task() {
    // Silently try to remove the old scheduled task - ignore errors
    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", LEGACY_TASK_NAME, "/F"])
        .output();
}

/// Get the path to the Windows Startup folder for the current user
fn get_startup_folder() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        // Use APPDATA to construct the Startup path
        // Startup folder is: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "Failed to get APPDATA environment variable".to_string())?;

        let startup_path = PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup");

        Ok(startup_path)
    }

    #[cfg(not(windows))]
    {
        Err("Startup folder is only available on Windows".to_string())
    }
}

/// Get the full path to the startup .bat file
fn get_bat_path() -> Result<PathBuf, String> {
    let startup_folder = get_startup_folder()?;
    Ok(startup_folder.join(BAT_FILENAME))
}

/// Check if the startup .bat file exists
#[tauri::command]
pub fn startup_is_enabled() -> Result<bool, String> {
    #[cfg(not(windows))]
    {
        return Ok(false);
    }

    #[cfg(windows)]
    {
        let bat_path = get_bat_path()?;
        Ok(bat_path.exists())
    }
}

/// Create a .bat file in the Startup folder to launch the app at login
#[tauri::command]
pub fn startup_enable(_app: AppHandle) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = _app;
        return Err("startup_enable is only supported on Windows".to_string());
    }

    #[cfg(windows)]
    {
        // Clean up any legacy scheduled task from previous versions
        cleanup_legacy_scheduled_task();

        let exe_path =
            std::env::current_exe().map_err(|e| format!("Failed to get exe path: {e}"))?;

        let exe_path_str = exe_path
            .to_str()
            .ok_or_else(|| "Executable path is not valid UTF-8".to_string())?;

        // Create a simple .bat file that starts the application
        // Using "start "" " to run detached (doesn't keep a console window open)
        let bat_content = format!("@echo off\r\nstart \"\" \"{}\"\r\n", exe_path_str);

        let bat_path = get_bat_path()?;

        // Ensure the startup folder exists (it should, but just in case)
        if let Some(parent) = bat_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create startup folder: {e}"))?;
        }

        fs::write(&bat_path, bat_content)
            .map_err(|e| format!("Failed to create startup batch file: {e}"))?;

        Ok(())
    }
}

/// Remove the startup .bat file
#[tauri::command]
pub fn startup_disable() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        // Also clean up any legacy scheduled task from previous versions
        cleanup_legacy_scheduled_task();

        let bat_path = get_bat_path()?;

        if bat_path.exists() {
            fs::remove_file(&bat_path)
                .map_err(|e| format!("Failed to remove startup batch file: {e}"))?;
        }

        Ok(())
    }
}

/// Check if the application is running with administrator privileges
#[tauri::command]
pub fn is_running_as_admin() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Security::{
            GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
        };
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token_handle = HANDLE::default();

            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token_handle).is_err() {
                return false;
            }

            let mut elevation = TOKEN_ELEVATION::default();
            let mut return_length = 0u32;

            let result = GetTokenInformation(
                token_handle,
                TokenElevation,
                Some(&mut elevation as *mut _ as *mut _),
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut return_length,
            );

            let _ = windows::Win32::Foundation::CloseHandle(token_handle);

            result.is_ok() && elevation.TokenIsElevated != 0
        }
    }

    #[cfg(not(windows))]
    {
        false
    }
}
