//! Headset commands for Tauri

use crate::services::headset::{self, HeadsetData};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug)]
pub struct IcueSdkStatus {
    /// Whether the SDK DLL is installed and accessible
    pub installed: bool,
    /// Path where SDK was found (if installed)
    pub sdk_path: Option<String>,
    /// Whether iCUE application is running
    pub icue_running: bool,
    /// Error message if any
    pub error: Option<String>,
    /// SDK version if detected
    pub version: Option<String>,
}

/// Get current headset data (battery, status, etc.)
#[tauri::command]
pub fn get_headset_data() -> HeadsetData {
    headset::get_headset_data()
}

/// Check if iCUE SDK is installed and available
#[tauri::command]
pub fn check_icue_sdk() -> IcueSdkStatus {
    #[cfg(windows)]
    {
        check_icue_sdk_windows()
    }
    #[cfg(not(windows))]
    {
        IcueSdkStatus {
            installed: false,
            sdk_path: None,
            icue_running: false,
            error: Some("iCUE SDK is only available on Windows".to_string()),
            version: None,
        }
    }
}

#[cfg(windows)]
fn check_icue_sdk_windows() -> IcueSdkStatus {
    use std::process::Command;

    // Check if iCUE is running
    let icue_running = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq iCUE.exe"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("iCUE.exe"))
        .unwrap_or(false);

    // First check project libs folder
    let project_paths = vec![
        PathBuf::from(r".\src-tauri\libs\iCUESDK\iCUESDK.x64_2019.dll"),
        PathBuf::from(r"src-tauri\libs\iCUESDK\iCUESDK.x64_2019.dll"),
        PathBuf::from(r"libs\iCUESDK\iCUESDK.x64_2019.dll"),
    ];

    for path in &project_paths {
        if path.exists() {
            return IcueSdkStatus {
                installed: true,
                sdk_path: Some(path.to_string_lossy().to_string()),
                icue_running,
                error: None,
                version: Some("4.x (bundled)".to_string()),
            };
        }
    }

    // Also check via the service module
    if let Some(sdk_path) = headset::get_sdk_path() {
        return IcueSdkStatus {
            installed: true,
            sdk_path: Some(sdk_path),
            icue_running,
            error: None,
            version: Some("4.x".to_string()),
        };
    }

    let sdk_dll_names = ["iCUESDK.x64_2019.dll", "CUESDK.x64_2019.dll"];

    // Common iCUE installation paths
    let possible_paths = vec![
        PathBuf::from(r"C:\Program Files\Corsair\CORSAIR iCUE 5 Software"),
        PathBuf::from(r"C:\Program Files\Corsair\CORSAIR iCUE 4 Software"),
        PathBuf::from(r"C:\Program Files\Corsair\Corsair Utility Engine"),
        PathBuf::from(r"C:\Program Files (x86)\Corsair\CORSAIR iCUE 5 Software"),
        PathBuf::from(r"C:\Program Files (x86)\Corsair\CORSAIR iCUE 4 Software"),
    ];

    // Search for SDK DLL
    for base_path in &possible_paths {
        for dll_name in &sdk_dll_names {
            let full_path = base_path.join(dll_name);
            if full_path.exists() {
                // Try to determine version from path
                let version = if base_path.to_string_lossy().contains("iCUE 5") {
                    Some("5.x".to_string())
                } else if base_path.to_string_lossy().contains("iCUE 4") {
                    Some("4.x".to_string())
                } else {
                    None
                };

                return IcueSdkStatus {
                    installed: true,
                    sdk_path: Some(full_path.to_string_lossy().to_string()),
                    icue_running,
                    error: None,
                    version,
                };
            }
        }
    }

    // SDK not found
    IcueSdkStatus {
        installed: false,
        sdk_path: None,
        icue_running,
        error: Some("iCUE SDK not found. Please install iCUE from corsair.com".to_string()),
        version: None,
    }
}

/// Install or update iCUE SDK
/// This opens the Corsair download page since the SDK requires iCUE to be installed
#[tauri::command]
pub async fn install_icue_sdk() -> Result<String, String> {
    #[cfg(windows)]
    {
        install_icue_sdk_windows().await
    }
    #[cfg(not(windows))]
    {
        Err("iCUE SDK is only available on Windows".to_string())
    }
}

#[cfg(windows)]
async fn install_icue_sdk_windows() -> Result<String, String> {
    use std::process::Command;

    // First check if iCUE is already installed
    let status = check_icue_sdk_windows();

    if status.installed {
        return Ok(format!(
            "iCUE SDK already installed at: {}",
            status.sdk_path.unwrap_or_default()
        ));
    }

    // iCUE needs to be installed - open the download page
    // The SDK is bundled with iCUE, so we need to install the full application
    let download_url = "https://www.corsair.com/us/en/s/downloads";

    // Try to open the download page in default browser
    let result = Command::new("cmd")
        .args(["/C", "start", download_url])
        .spawn();

    match result {
        Ok(_) => Ok("Opening Corsair download page...\n\n\
            Please download and install 'iCUE' from the page.\n\
            The SDK is included with iCUE installation.\n\n\
            After installing iCUE:\n\
            1. Make sure iCUE is running\n\
            2. Restart this application\n\
            3. Your Corsair headset should be detected automatically"
            .to_string()),
        Err(e) => Err(format!(
            "Failed to open browser: {}\n\n\
            Please manually visit: {}\n\
            Download and install iCUE to get the SDK.",
            e, download_url
        )),
    }
}

/// Get detailed instructions for setting up iCUE SDK
#[tauri::command]
pub fn get_icue_setup_instructions() -> String {
    r#"# iCUE SDK Setup Instructions

## Requirements
- Windows 10 or later
- Corsair iCUE software installed
- A compatible Corsair headset (VOID, Virtuoso, HS70, etc.)

## Installation Steps

1. **Download iCUE**
   Visit: https://www.corsair.com/us/en/s/downloads
   Download the latest iCUE software

2. **Install iCUE**
   Run the installer and follow the prompts
   The SDK DLL is included automatically

3. **Launch iCUE**
   iCUE must be running for the SDK to work
   Enable "Start on Windows startup" in iCUE settings

4. **Connect Your Headset**
   - For wireless headsets: Insert the USB dongle
   - For wired headsets: Connect via USB
   - Wait for iCUE to detect the device

5. **Restart This Application**
   Close and reopen this taskbar application
   The headset widget should now show battery status

## Troubleshooting

- **SDK not found**: Make sure iCUE is installed in the default location
- **Headset not detected**: Check if the headset appears in iCUE
- **Battery not showing**: Some wired headsets don't report battery level

## Supported Headsets
- VOID RGB Elite (Wireless/USB)
- VOID PRO RGB (Wireless/USB/Surround)
- Virtuoso RGB Wireless (SE/XT)
- HS70 / HS70 Pro Wireless
- HS80 RGB Wireless
"#
    .to_string()
}
