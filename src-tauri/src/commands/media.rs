//! Media commands for Tauri

use crate::services::media::{self, MediaData};

/// Get current media data
#[tauri::command]
pub fn get_media_data() -> MediaData {
    media::get_media_data()
}

/// Toggle play/pause
#[tauri::command]
pub fn media_play_pause() -> Result<(), String> {
    media::play_pause()
}

/// Skip to next track
#[tauri::command]
pub fn media_next() -> Result<(), String> {
    media::next_track()
}

/// Skip to previous track
#[tauri::command]
pub fn media_previous() -> Result<(), String> {
    media::previous_track()
}

/// Seek to specific position in seconds
#[tauri::command]
pub fn media_seek(position_seconds: f64) -> Result<(), String> {
    media::seek_to_position(position_seconds)
}
