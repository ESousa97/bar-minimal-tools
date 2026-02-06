//! Weather service using Open-Meteo API (free, no API key required)

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CACHE_DURATION_SECS: u64 = 600; // 10 minutes

#[derive(Serialize, Clone, Debug, Default)]
pub struct WeatherData {
    pub loaded: bool,
    pub city: String,
    pub country: String,
    pub temperature: f64,
    pub feels_like: f64,
    pub temp_min: f64,
    pub temp_max: f64,
    pub humidity: u32,
    pub pressure: u32,
    pub description: String,
    pub icon: String,
    pub wind_speed: f64,
    pub wind_deg: u32,
    pub clouds: u32,
    pub visibility: u32,
    pub sunrise: i64,
    pub sunset: i64,
}

/// Location data from IP geolocation
#[derive(Serialize, Clone, Debug, Default)]
pub struct LocationData {
    pub latitude: f64,
    pub longitude: f64,
    pub city: String,
    pub region: String,
    pub country: String,
    pub success: bool,
}

// Open-Meteo API response structures
#[derive(Deserialize, Debug)]
struct OpenMeteoResponse {
    current: Option<OpenMeteoCurrent>,
    daily: Option<OpenMeteoDaily>,
}

#[derive(Deserialize, Debug)]
struct OpenMeteoCurrent {
    temperature_2m: Option<f64>,
    apparent_temperature: Option<f64>,
    relative_humidity_2m: Option<u32>,
    surface_pressure: Option<f64>,
    wind_speed_10m: Option<f64>,
    wind_direction_10m: Option<u32>,
    cloud_cover: Option<u32>,
    weather_code: Option<u32>,
    is_day: Option<u8>,
}

#[derive(Deserialize, Debug)]
struct OpenMeteoDaily {
    temperature_2m_max: Option<Vec<f64>>,
    temperature_2m_min: Option<Vec<f64>>,
    sunrise: Option<Vec<String>>,
    sunset: Option<Vec<String>>,
}

// IP geolocation response
#[derive(Deserialize, Debug)]
struct IpInfoResponse {
    loc: Option<String>, // "lat,lon" format
    city: Option<String>,
    region: Option<String>,
    country: Option<String>,
}

// Cache for weather data
static WEATHER_CACHE: OnceLock<Mutex<WeatherCache>> = OnceLock::new();

struct WeatherCache {
    data: WeatherData,
    last_update: Option<Instant>,
    last_lat: f64,
    last_lon: f64,
}

impl Default for WeatherCache {
    fn default() -> Self {
        Self {
            data: WeatherData::default(),
            last_update: None,
            last_lat: 0.0,
            last_lon: 0.0,
        }
    }
}

fn get_cache() -> &'static Mutex<WeatherCache> {
    WEATHER_CACHE.get_or_init(|| Mutex::new(WeatherCache::default()))
}

pub fn get_weather(lat: f64, lon: f64) -> WeatherData {
    // Check cache
    {
        if let Ok(guard) = get_cache().lock() {
            let same_location =
                (guard.last_lat - lat).abs() < 0.01 && (guard.last_lon - lon).abs() < 0.01;
            let cache_valid = guard
                .last_update
                .map(|t| t.elapsed() < Duration::from_secs(CACHE_DURATION_SECS))
                .unwrap_or(false);
            if guard.data.loaded && same_location && cache_valid {
                return guard.data.clone();
            }
        }
    }

    // Fetch new data
    let data = fetch_weather_blocking(lat, lon);

    // Update cache
    if let Ok(mut guard) = get_cache().lock() {
        guard.data = data.clone();
        guard.last_update = Some(Instant::now());
        guard.last_lat = lat;
        guard.last_lon = lon;
    }

    data
}

fn fetch_weather_blocking(lat: f64, lon: f64) -> WeatherData {
    // Use Open-Meteo API (free, no API key required)
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto",
        lat, lon
    );

    match ureq::get(&url).call() {
        Ok(response) => match response.into_body().read_json::<OpenMeteoResponse>() {
            Ok(data) => {
                let current = data.current.unwrap_or(OpenMeteoCurrent {
                    temperature_2m: None,
                    apparent_temperature: None,
                    relative_humidity_2m: None,
                    surface_pressure: None,
                    wind_speed_10m: None,
                    wind_direction_10m: None,
                    cloud_cover: None,
                    weather_code: None,
                    is_day: None,
                });
                let daily = data.daily.unwrap_or(OpenMeteoDaily {
                    temperature_2m_max: None,
                    temperature_2m_min: None,
                    sunrise: None,
                    sunset: None,
                });

                let weather_code = current.weather_code.unwrap_or(0);
                let is_day = current.is_day.unwrap_or(1) == 1;
                let (description, icon) = weather_code_to_description(weather_code, is_day);

                WeatherData {
                    loaded: true,
                    city: String::new(), // Will be filled from location
                    country: String::new(),
                    temperature: current.temperature_2m.unwrap_or(0.0),
                    feels_like: current.apparent_temperature.unwrap_or(0.0),
                    temp_min: daily
                        .temperature_2m_min
                        .as_ref()
                        .and_then(|v: &Vec<f64>| v.first().copied())
                        .unwrap_or(0.0),
                    temp_max: daily
                        .temperature_2m_max
                        .as_ref()
                        .and_then(|v: &Vec<f64>| v.first().copied())
                        .unwrap_or(0.0),
                    humidity: current.relative_humidity_2m.unwrap_or(0),
                    pressure: current.surface_pressure.unwrap_or(0.0) as u32,
                    description,
                    icon,
                    wind_speed: current.wind_speed_10m.unwrap_or(0.0) / 3.6, // km/h to m/s
                    wind_deg: current.wind_direction_10m.unwrap_or(0),
                    clouds: current.cloud_cover.unwrap_or(0),
                    visibility: 10000,
                    sunrise: parse_iso_time(
                        daily.sunrise.as_ref().and_then(|v: &Vec<String>| v.first()),
                    ),
                    sunset: parse_iso_time(
                        daily.sunset.as_ref().and_then(|v: &Vec<String>| v.first()),
                    ),
                }
            }
            Err(e) => {
                eprintln!("Failed to parse weather data: {}", e);
                WeatherData::default()
            }
        },
        Err(e) => {
            eprintln!("Failed to fetch weather: {}", e);
            WeatherData::default()
        }
    }
}

/// Get weather icon URL (kept for compatibility, but icons are now handled in frontend)
pub fn get_weather_icon_url(icon: &str) -> String {
    format!("https://openweathermap.org/img/wn/{}@2x.png", icon)
}

/// Convert WMO weather code to description and icon
fn weather_code_to_description(code: u32, is_day: bool) -> (String, String) {
    let suffix = if is_day { "d" } else { "n" };
    match code {
        0 => ("Céu limpo".to_string(), format!("01{}", suffix)),
        1 => ("Principalmente limpo".to_string(), format!("01{}", suffix)),
        2 => ("Parcialmente nublado".to_string(), format!("02{}", suffix)),
        3 => ("Nublado".to_string(), format!("03{}", suffix)),
        45 | 48 => ("Neblina".to_string(), format!("50{}", suffix)),
        51 | 53 | 55 => ("Garoa".to_string(), format!("09{}", suffix)),
        56 | 57 => ("Garoa congelante".to_string(), format!("09{}", suffix)),
        61 | 63 | 65 => ("Chuva".to_string(), format!("10{}", suffix)),
        66 | 67 => ("Chuva congelante".to_string(), format!("10{}", suffix)),
        71 | 73 | 75 => ("Neve".to_string(), format!("13{}", suffix)),
        77 => ("Granizo".to_string(), format!("13{}", suffix)),
        80..=82 => ("Pancadas de chuva".to_string(), format!("09{}", suffix)),
        85 | 86 => ("Pancadas de neve".to_string(), format!("13{}", suffix)),
        95 => ("Tempestade".to_string(), format!("11{}", suffix)),
        96 | 99 => (
            "Tempestade com granizo".to_string(),
            format!("11{}", suffix),
        ),
        _ => ("Desconhecido".to_string(), format!("01{}", suffix)),
    }
}

/// Parse ISO 8601 datetime to Unix timestamp
fn parse_iso_time(time_str: Option<&String>) -> i64 {
    time_str
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(&format!("{}:00+00:00", s)).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or(0)
}

/// Get current location from IP address
pub fn get_current_location() -> LocationData {
    // Use ipinfo.io (more reliable, free tier)
    let url = "https://ipinfo.io/json";

    match ureq::get(url).call() {
        Ok(response) => match response.into_body().read_json::<IpInfoResponse>() {
            Ok(data) => {
                // Parse "lat,lon" format
                let (lat, lon) = data
                    .loc
                    .as_ref()
                    .and_then(|loc: &String| {
                        let parts: Vec<&str> = loc.split(',').collect();
                        if parts.len() == 2 {
                            Some((
                                parts[0].parse::<f64>().unwrap_or(0.0),
                                parts[1].parse::<f64>().unwrap_or(0.0),
                            ))
                        } else {
                            None
                        }
                    })
                    .unwrap_or((0.0, 0.0));

                LocationData {
                    latitude: lat,
                    longitude: lon,
                    city: data.city.unwrap_or_default(),
                    region: data.region.unwrap_or_default(),
                    country: data.country.unwrap_or_default(),
                    success: lat != 0.0 && lon != 0.0,
                }
            }
            Err(e) => {
                eprintln!("Failed to parse location data: {}", e);
                LocationData::default()
            }
        },
        Err(e) => {
            eprintln!("Failed to fetch location: {}", e);
            LocationData::default()
        }
    }
}
