//! Profile-based configuration management

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WidgetConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub widget_type: String,
    pub enabled: bool,
    pub order: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DisplayConfig {
    #[serde(alias = "target_monitor")]
    pub target_monitor: String,
    #[serde(alias = "bar_height")]
    pub bar_height: u32,
    pub theme: String,
    pub opacity: f32,
    pub blur: bool,
}

impl Default for DisplayConfig {
    fn default() -> Self {
        Self {
            target_monitor: "monitor_0".to_string(),
            bar_height: 28,
            theme: "dark".to_string(),
            opacity: 0.95,
            blur: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PollingConfig {
    #[serde(alias = "interval_ms")]
    pub interval_ms: u32,
    #[serde(alias = "detailed_interval_ms")]
    pub detailed_interval_ms: u32,
}

impl Default for PollingConfig {
    fn default() -> Self {
        Self {
            interval_ms: 1000,
            detailed_interval_ms: 5000,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WeatherConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub use_auto_location: bool,
    #[serde(default = "default_latitude")]
    pub latitude: f64,
    #[serde(default = "default_longitude")]
    pub longitude: f64,
    #[serde(default = "default_city")]
    pub city_name: String,
}

fn default_true() -> bool {
    true
}
fn default_latitude() -> f64 {
    -23.5505
}
fn default_longitude() -> f64 {
    -46.6333
}
fn default_city() -> String {
    "São Paulo".to_string()
}

/// Single folder shortcut entry
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderShortcut {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: String,
    pub enabled: bool,
}

/// Folder shortcuts config
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderShortcutsConfig {
    pub shortcuts: Vec<FolderShortcut>,
}

impl Default for FolderShortcutsConfig {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        Self {
            shortcuts: vec![
                FolderShortcut {
                    id: "downloads".to_string(),
                    name: "Downloads".to_string(),
                    path: home.join("Downloads").to_string_lossy().to_string(),
                    icon: "download".to_string(),
                    enabled: true,
                },
                FolderShortcut {
                    id: "documents".to_string(),
                    name: "Documentos".to_string(),
                    path: home.join("Documents").to_string_lossy().to_string(),
                    icon: "file-text".to_string(),
                    enabled: true,
                },
                FolderShortcut {
                    id: "pictures".to_string(),
                    name: "Imagens".to_string(),
                    path: home.join("Pictures").to_string_lossy().to_string(),
                    icon: "image".to_string(),
                    enabled: true,
                },
                FolderShortcut {
                    id: "music".to_string(),
                    name: "Músicas".to_string(),
                    path: home.join("Music").to_string_lossy().to_string(),
                    icon: "music".to_string(),
                    enabled: true,
                },
                FolderShortcut {
                    id: "videos".to_string(),
                    name: "Vídeos".to_string(),
                    path: home.join("Videos").to_string_lossy().to_string(),
                    icon: "video".to_string(),
                    enabled: true,
                },
            ],
        }
    }
}

impl Default for WeatherConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            use_auto_location: true,
            latitude: -23.5505,
            longitude: -46.6333,
            city_name: "São Paulo".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub profile_name: String,
    pub created_at: String,
    pub modified_at: String,
    pub display: DisplayConfig,
    pub widgets: Vec<WidgetConfig>,
    pub polling: PollingConfig,
    #[serde(default)]
    pub weather: WeatherConfig,
    #[serde(default)]
    pub folder_shortcuts: FolderShortcutsConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::default_with_name("Default")
    }
}

impl AppConfig {
    pub fn default_with_name(name: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            profile_name: name.to_string(),
            created_at: now.clone(),
            modified_at: now,
            display: DisplayConfig::default(),
            widgets: vec![
                WidgetConfig {
                    id: "cpu-1".to_string(),
                    widget_type: "cpu".to_string(),
                    enabled: true,
                    order: 0,
                },
                WidgetConfig {
                    id: "ram-1".to_string(),
                    widget_type: "ram".to_string(),
                    enabled: true,
                    order: 1,
                },
                WidgetConfig {
                    id: "gpu-1".to_string(),
                    widget_type: "gpu".to_string(),
                    enabled: true,
                    order: 2,
                },
                WidgetConfig {
                    id: "storage-1".to_string(),
                    widget_type: "storage".to_string(),
                    enabled: true,
                    order: 3,
                },
                WidgetConfig {
                    id: "network-1".to_string(),
                    widget_type: "network".to_string(),
                    enabled: true,
                    order: 4,
                },
                WidgetConfig {
                    id: "media-1".to_string(),
                    widget_type: "media".to_string(),
                    enabled: true,
                    order: 5,
                },
                WidgetConfig {
                    id: "audio-1".to_string(),
                    widget_type: "audio".to_string(),
                    enabled: true,
                    order: 90,
                },
                WidgetConfig {
                    id: "headset-1".to_string(),
                    widget_type: "headset".to_string(),
                    enabled: true,
                    order: 91,
                },
                WidgetConfig {
                    id: "weather-1".to_string(),
                    widget_type: "weather".to_string(),
                    enabled: true,
                    order: 92,
                },
                WidgetConfig {
                    id: "clock-1".to_string(),
                    widget_type: "clock".to_string(),
                    enabled: true,
                    order: 93,
                },
            ],
            polling: PollingConfig::default(),
            weather: WeatherConfig::default(),
            folder_shortcuts: FolderShortcutsConfig::default(),
        }
    }
}

#[derive(Serialize)]
pub struct ProfileSummary {
    pub filename: String,
    pub name: String,
    pub is_active: bool,
    pub modified_at: String,
}

/// Get the profiles directory (next to executable)
fn get_profiles_dir() -> PathBuf {
    std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("."))
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join("profiles")
}

fn ensure_default_profile(dir: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let default_config = AppConfig::default();
    let content = serde_json::to_string_pretty(&default_config).map_err(|e| e.to_string())?;
    fs::write(dir.join("default.json"), content).map_err(|e| e.to_string())?;
    fs::write(dir.join("_active.txt"), "default").map_err(|e| e.to_string())?;
    Ok(())
}

fn get_active_profile_name() -> String {
    let active_file = get_profiles_dir().join("_active.txt");
    fs::read_to_string(active_file).unwrap_or_else(|_| "default".to_string())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .to_lowercase()
}

/// List all available profiles
#[tauri::command]
pub fn list_profiles() -> Result<Vec<ProfileSummary>, String> {
    let dir = get_profiles_dir();

    // Ensure profiles directory exists with default profile
    if !dir.exists() {
        ensure_default_profile(&dir)?;
    }

    let active = get_active_profile_name();

    let profiles = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            let ext = path.extension()?.to_str()?;

            if ext != "json" {
                return None;
            }

            let content = fs::read_to_string(&path).ok()?;
            let config: serde_json::Value = serde_json::from_str(&content).ok()?;
            let filename = path.file_stem()?.to_str()?.to_string();

            Some(ProfileSummary {
                is_active: filename == active,
                filename,
                name: config.get("profileName")?.as_str()?.to_string(),
                modified_at: config.get("modifiedAt")?.as_str()?.to_string(),
            })
        })
        .collect();

    Ok(profiles)
}

/// Create a new profile
#[tauri::command]
pub fn create_profile(name: String) -> Result<String, String> {
    let dir = get_profiles_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = sanitize_filename(&name);
    let path = dir.join(format!("{}.json", filename));

    if path.exists() {
        return Err("Profile already exists".to_string());
    }

    let config = AppConfig::default_with_name(&name);
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(filename)
}

/// Switch to a different profile
#[tauri::command]
pub fn switch_profile(filename: String) -> Result<AppConfig, String> {
    let dir = get_profiles_dir();
    let path = dir.join(format!("{}.json", filename));

    if !path.exists() {
        return Err("Profile not found".to_string());
    }

    // Update active profile marker
    fs::write(dir.join("_active.txt"), &filename).map_err(|e| e.to_string())?;

    // Load and return profile
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Save current profile
#[tauri::command]
pub fn save_current_profile(config: AppConfig) -> Result<(), String> {
    let dir = get_profiles_dir();
    let active = get_active_profile_name();
    let path = dir.join(format!("{}.json", active));

    let mut updated = config;
    updated.modified_at = chrono::Utc::now().to_rfc3339();

    let content = serde_json::to_string_pretty(&updated).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the currently active profile
#[tauri::command]
pub fn get_active_profile() -> Result<AppConfig, String> {
    let dir = get_profiles_dir();
    let active = get_active_profile_name();
    let path = dir.join(format!("{}.json", active));

    if !path.exists() {
        // Create default if doesn't exist
        let config = AppConfig::default();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())?;
        fs::write(dir.join("_active.txt"), "default").map_err(|e| e.to_string())?;
        return Ok(config);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Export a profile to a file
#[tauri::command]
pub fn export_profile(filename: String, destination: String) -> Result<(), String> {
    let source = get_profiles_dir().join(format!("{}.json", filename));
    fs::copy(&source, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

/// Import a profile from a file
#[tauri::command]
pub fn import_profile(source: String) -> Result<String, String> {
    let content = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let filename = sanitize_filename(&config.profile_name);
    let dest = get_profiles_dir().join(format!("{}.json", filename));
    fs::write(&dest, &content).map_err(|e| e.to_string())?;

    Ok(filename)
}

/// Save weather configuration
#[tauri::command]
pub fn save_weather_config(weather: WeatherConfig) -> Result<(), String> {
    let dir = get_profiles_dir();
    let active = get_active_profile_name();
    let path = dir.join(format!("{}.json", active));

    let mut config = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str::<AppConfig>(&content).map_err(|e| e.to_string())?
    } else {
        AppConfig::default()
    };

    config.weather = weather;
    config.modified_at = chrono::Utc::now().to_rfc3339();

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get weather configuration
#[tauri::command]
pub fn get_weather_config() -> Result<WeatherConfig, String> {
    let config = get_active_profile()?;
    Ok(config.weather)
}

/// Factory reset: wipe profiles + app cache and recreate Default profile.
/// This is intended to recover from corrupted/stale config state.
#[tauri::command]
pub fn factory_reset(app: AppHandle) -> Result<(), String> {
    // 1) Remove profiles directory next to executable.
    let profiles_dir = get_profiles_dir();
    if profiles_dir.exists() {
        // Best effort: try full remove; if it fails, try removing known files.
        if fs::remove_dir_all(&profiles_dir).is_err() {
            let _ = fs::remove_file(profiles_dir.join("_active.txt"));
            if let Ok(entries) = fs::read_dir(&profiles_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("json") {
                        let _ = fs::remove_file(path);
                    }
                }
            }
            let _ = fs::remove_dir(&profiles_dir);
        }
    }
    ensure_default_profile(&profiles_dir)?;

    // 2) Remove app data dir (cache), e.g. notes.json.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    if app_data_dir.exists() {
        // Best effort, same idea.
        if fs::remove_dir_all(&app_data_dir).is_err() {
            let _ = fs::remove_file(app_data_dir.join("notes.json"));
        }
    }
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to recreate app data dir: {e}"))?;

    Ok(())
}
