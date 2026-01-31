//! Media service for Windows Media Session integration
//! Provides media playback info and controls for system-wide media
//!
//! Architecture: Polling with Rust-side interpolation
//! - Background thread polls SMTC every 1s for stable data
//! - Rust-side interpolation for smooth timeline (avoids 51<->52 oscillation)
//! - Frontend uses requestAnimationFrame for 60fps smooth UI

use serde::{Deserialize, Serialize};

/// Playback status
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
    Unknown,
}

/// Media information
#[derive(Serialize, Clone, Debug)]
pub struct MediaData {
    /// Whether there's active media
    pub has_media: bool,
    /// Track title
    pub title: String,
    /// Artist name
    pub artist: String,
    /// Album name
    pub album: String,
    /// Source app name (e.g., "Spotify", "Chrome", "Firefox")
    pub source_app: String,
    /// Playback status
    pub status: PlaybackStatus,
    /// Thumbnail as base64 encoded image (if available)
    pub thumbnail_base64: Option<String>,
    /// Current position in seconds
    pub position_seconds: f64,
    /// Total duration in seconds
    pub duration_seconds: f64,
}

impl Default for MediaData {
    fn default() -> Self {
        Self {
            has_media: false,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            source_app: String::new(),
            status: PlaybackStatus::Stopped,
            thumbnail_base64: None,
            position_seconds: 0.0,
            duration_seconds: 0.0,
        }
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    // Background thread polls SMTC and caches the result.
    // We keep an interpolation model in Rust to avoid UI jitter (e.g. 51<->52 loops)
    // caused by small timeline quantization / update cadence differences.
    #[derive(Clone, Debug)]
    struct MediaCache {
        media: MediaData,
        track_key: String,
        base_position: f64,
        base_instant: Instant,
        is_playing: bool,
        duration: f64,
    }

    impl Default for MediaCache {
        fn default() -> Self {
            Self {
                media: MediaData::default(),
                track_key: String::new(),
                base_position: 0.0,
                base_instant: Instant::now(),
                is_playing: false,
                duration: 0.0,
            }
        }
    }

    static MEDIA_STATE: OnceLock<Mutex<MediaCache>> = OnceLock::new();
    static MEDIA_REFRESH_STARTED: OnceLock<()> = OnceLock::new();

    fn get_state() -> &'static Mutex<MediaCache> {
        MEDIA_STATE.get_or_init(|| Mutex::new(MediaCache::default()))
    }

    fn make_track_key(media: &MediaData) -> String {
        format!(
            "{}|{}|{}|{}",
            media.source_app, media.title, media.artist, media.album
        )
    }

    fn estimated_position(cache: &MediaCache) -> f64 {
        if !cache.is_playing {
            return cache.base_position;
        }

        let mut pos = cache.base_position + cache.base_instant.elapsed().as_secs_f64();
        if cache.duration > 0.0 && pos > cache.duration {
            pos = cache.duration;
        }
        if pos.is_sign_negative() {
            0.0
        } else {
            pos
        }
    }

    fn reset_cache(cache: &mut MediaCache, media: MediaData) {
        let now = Instant::now();
        cache.track_key = make_track_key(&media);
        cache.base_position = media.position_seconds;
        cache.base_instant = now;
        cache.is_playing = media.status == PlaybackStatus::Playing;
        cache.duration = media.duration_seconds;
        cache.media = media;
    }

    fn update_cache(cache: &mut MediaCache, media: MediaData) {
        if !media.has_media {
            *cache = MediaCache::default();
            cache.media = media;
            return;
        }

        let now = Instant::now();
        let new_track_key = make_track_key(&media);
        let new_is_playing = media.status == PlaybackStatus::Playing;
        let new_pos = media.position_seconds;
        let new_dur = media.duration_seconds;

        let track_changed = cache.track_key != new_track_key;
        let duration_changed = (cache.duration - new_dur).abs() > 1.0;
        let was_empty = !cache.media.has_media;

        if was_empty || track_changed || duration_changed {
            reset_cache(cache, media);
            return;
        }

        let predicted = estimated_position(cache);
        let drift = new_pos - predicted;

        if cache.is_playing != new_is_playing {
            cache.base_position = new_pos;
            cache.base_instant = now;
            cache.is_playing = new_is_playing;
            cache.duration = new_dur;
            cache.media = media;
            return;
        }

        if !new_is_playing {
            cache.base_position = new_pos;
            cache.base_instant = now;
            cache.duration = new_dur;
            cache.media = media;
            return;
        }

        // Only hard-resync on large drift (seek/buffering)
        const DRIFT_RESYNC_SECONDS: f64 = 1.5;
        if drift.abs() > DRIFT_RESYNC_SECONDS {
            cache.base_position = new_pos;
            cache.base_instant = now;
        }

        cache.duration = new_dur;
        cache.media = media;
    }

    pub fn get_media_data() -> MediaData {
        start_background_refresh();

        match get_state().lock() {
            Ok(cache) => {
                let mut out = cache.media.clone();
                if out.has_media {
                    out.position_seconds = estimated_position(&cache);
                }
                out
            }
            Err(_) => MediaData::default(),
        }
    }

    fn start_background_refresh() {
        if MEDIA_REFRESH_STARTED.set(()).is_err() {
            return;
        }

        std::thread::Builder::new()
            .name("media-refresh".to_string())
            .spawn(|| {
                unsafe {
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }

                loop {
                    let result = std::panic::catch_unwind(fetch_media_data_internal);
                    if let Ok(data) = result {
                        if let Ok(mut cache) = get_state().lock() {
                            update_cache(&mut cache, data);
                        }
                    }

                    // Poll at 1s - interpolation handles smooth timeline in between
                    std::thread::sleep(Duration::from_millis(1000));
                }
            })
            .ok();
    }

    fn fetch_media_data_internal() -> MediaData {
        // Request session manager
        let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            Ok(op) => match op.get() {
                Ok(m) => m,
                Err(_) => return MediaData::default(),
            },
            Err(_) => return MediaData::default(),
        };

        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return MediaData::default(),
        };

        // Get source app info
        let source_app = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_default();

        let source_app = extract_app_name(&source_app);

        // Get playback info
        let playback_info = match session.GetPlaybackInfo() {
            Ok(info) => info,
            Err(_) => {
                return MediaData {
                    has_media: false,
                    source_app,
                    ..Default::default()
                }
            }
        };

        let status = match playback_info.PlaybackStatus() {
            Ok(s) => match s {
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => {
                    PlaybackStatus::Playing
                }
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
                    PlaybackStatus::Paused
                }
                GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped => {
                    PlaybackStatus::Stopped
                }
                _ => PlaybackStatus::Unknown,
            },
            Err(_) => PlaybackStatus::Unknown,
        };

        // Get media properties
        let (title, artist, album) = match session.TryGetMediaPropertiesAsync() {
            Ok(op) => match op.get() {
                Ok(props) => {
                    let t = props.Title().map(|s| s.to_string()).unwrap_or_default();
                    let a = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                    let al = props
                        .AlbumTitle()
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    (t, a, al)
                }
                Err(_) => (String::new(), String::new(), String::new()),
            },
            Err(_) => (String::new(), String::new(), String::new()),
        };

        // Get timeline properties (raw values). We smooth/interpolate in Rust.
        // IMPORTANT: SMTC Position() returns the position at LastUpdatedTime, NOT current position.
        // We must add the elapsed time since LastUpdatedTime to get the real current position.
        let (position_seconds, duration_seconds) = match session.GetTimelineProperties() {
            Ok(timeline) => {
                let pos = timeline
                    .Position()
                    .map(|d| d.Duration as f64 / 10_000_000.0)
                    .unwrap_or(0.0);
                let dur = timeline
                    .EndTime()
                    .map(|d| d.Duration as f64 / 10_000_000.0)
                    .unwrap_or(0.0);

                // Get LastUpdatedTime and calculate real position
                let real_pos = if status == PlaybackStatus::Playing {
                    if let Ok(last_updated) = timeline.LastUpdatedTime() {
                        // LastUpdatedTime is a DateTime (100-nanosecond intervals since Jan 1, 1601)
                        // Get current time in same format
                        use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;

                        let now_ft = unsafe { GetSystemTimeAsFileTime() };

                        // Convert FILETIME to i64 (100-ns units)
                        let now_ticks =
                            ((now_ft.dwHighDateTime as i64) << 32) | (now_ft.dwLowDateTime as i64);
                        let last_ticks = last_updated.UniversalTime;

                        // Calculate elapsed seconds since last update
                        let elapsed_ticks = now_ticks - last_ticks;
                        let elapsed_seconds = elapsed_ticks as f64 / 10_000_000.0;

                        // Real position = reported position + elapsed time
                        let calculated = pos + elapsed_seconds;

                        // Clamp to valid range
                        if calculated < 0.0 {
                            0.0
                        } else if dur > 0.0 && calculated > dur {
                            dur
                        } else {
                            calculated
                        }
                    } else {
                        pos
                    }
                } else {
                    // When paused, position is accurate
                    pos
                };

                (real_pos, dur)
            }
            Err(_) => (0.0, 0.0),
        };

        let has_media = !title.is_empty() || status == PlaybackStatus::Playing;

        // Get thumbnail for browsers (YouTube, etc)
        let thumbnail_base64 =
            if source_app == "Chrome" || source_app == "Firefox" || source_app == "Edge" {
                get_thumbnail(&session)
            } else {
                None
            };

        MediaData {
            has_media,
            title,
            artist,
            album,
            source_app,
            status,
            thumbnail_base64,
            position_seconds,
            duration_seconds,
        }
    }

    fn get_thumbnail(
        session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
    ) -> Option<String> {
        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let thumbnail_ref = props.Thumbnail().ok()?;
        let stream = thumbnail_ref.OpenReadAsync().ok()?.get().ok()?;

        let size = stream.Size().ok()? as usize;
        if size == 0 || size > 1024 * 1024 {
            // Skip if empty or > 1MB
            return None;
        }

        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size as u32).ok()?.get().ok()?;

        let mut buffer = vec![0u8; size];
        reader.ReadBytes(&mut buffer).ok()?;

        Some(BASE64.encode(&buffer))
    }

    fn extract_app_name(app_id: &str) -> String {
        // Extract readable app name from app model ID
        if app_id.contains("Spotify") {
            return "Spotify".to_string();
        }
        if app_id.contains("Chrome") || app_id.contains("chrome") {
            return "Chrome".to_string();
        }
        if app_id.contains("Firefox") || app_id.contains("firefox") {
            return "Firefox".to_string();
        }
        if app_id.contains("Edge") || app_id.contains("msedge") {
            return "Edge".to_string();
        }
        if app_id.contains("Music") || app_id.contains("Groove") {
            return "Groove Music".to_string();
        }
        if app_id.contains("VLC") || app_id.contains("vlc") {
            return "VLC".to_string();
        }
        if app_id.contains("foobar") {
            return "foobar2000".to_string();
        }

        // Return last part of app ID or the whole thing
        app_id
            .split('!')
            .next()
            .and_then(|s| s.split('\\').last())
            .unwrap_or(app_id)
            .to_string()
    }

    pub fn play_pause() -> Result<(), String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;

        session
            .TryTogglePlayPauseAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn next_track() -> Result<(), String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;

        session
            .TrySkipNextAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn previous_track() -> Result<(), String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;

        session
            .TrySkipPreviousAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn seek_to_position(position_seconds: f64) -> Result<(), String> {
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;

        // Convert seconds to 100-nanosecond units (Windows TimeSpan format)
        let position_ticks = (position_seconds * 10_000_000.0) as i64;

        session
            .TryChangePlaybackPositionAsync(position_ticks)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        // Update cache immediately for responsive UI; background poll will confirm.
        if let Ok(mut cache) = get_state().lock() {
            if cache.media.has_media {
                cache.base_position = position_seconds.max(0.0);
                cache.base_instant = Instant::now();
                cache.media.position_seconds = cache.base_position;
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use windows_impl::*;

// Non-Windows fallback
#[cfg(not(windows))]
pub fn get_media_data() -> MediaData {
    MediaData::default()
}

#[cfg(not(windows))]
pub fn play_pause() -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[cfg(not(windows))]
pub fn next_track() -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[cfg(not(windows))]
pub fn previous_track() -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[cfg(not(windows))]
pub fn seek_to_position(_position_seconds: f64) -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}
