//! Audio commands

use crate::services::audio::{self, AudioData};

/// Get all audio devices and current volume
#[tauri::command]
pub async fn get_audio_data() -> Result<AudioData, String> {
    Ok(audio::get_audio_data())
}

/// Set master volume (0-100)
#[tauri::command]
pub async fn set_master_volume(volume: u32) -> Result<(), String> {
    audio::set_master_volume(volume)
}

/// Adjust master volume by delta (-100 to +100)
#[tauri::command]
pub async fn adjust_master_volume(delta: i32) -> Result<u32, String> {
    let current = audio::get_audio_data();
    let new_volume = ((current.master_volume as i32) + delta).clamp(0, 100) as u32;
    audio::set_master_volume(new_volume)?;
    Ok(new_volume)
}

/// Toggle mute on master volume
#[tauri::command]
pub async fn toggle_mute() -> Result<bool, String> {
    audio::toggle_mute()
}

/// Set volume for a specific device
#[tauri::command]
pub async fn set_device_volume(device_id: String, volume: u32) -> Result<(), String> {
    audio::set_device_volume(&device_id, volume)
}

/// Set the default audio device (output or input endpoint)
#[tauri::command]
pub async fn set_default_audio_device(device_id: String) -> Result<(), String> {
    audio::set_default_device(&device_id)
}
