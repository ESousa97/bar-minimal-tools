//! Weather commands for Tauri

use crate::services::weather::{self, LocationData, WeatherData};

/// Get current weather data by coordinates
#[tauri::command]
pub fn get_weather(lat: f64, lon: f64) -> WeatherData {
    weather::get_weather(lat, lon)
}

/// Get weather icon URL
#[tauri::command]
pub fn get_weather_icon_url(icon: String) -> String {
    weather::get_weather_icon_url(&icon)
}

/// Get current location from IP address
#[tauri::command]
pub fn get_current_location() -> LocationData {
    weather::get_current_location()
}
