//! Weather service using OpenWeather API

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const API_KEY: &str = "8b54d17614da9fca4767c1e0ab3d4d38";
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

#[derive(Deserialize, Debug)]
struct IpApiResponse {
    latitude: Option<f64>,
    longitude: Option<f64>,
    city: Option<String>,
    region: Option<String>,
    country_name: Option<String>,
}

#[derive(Deserialize, Debug)]
struct OpenWeatherResponse {
    name: String,
    sys: SysInfo,
    main: MainInfo,
    weather: Vec<WeatherInfo>,
    wind: WindInfo,
    clouds: CloudsInfo,
    visibility: Option<u32>,
}

#[derive(Deserialize, Debug)]
struct SysInfo {
    country: Option<String>,
    sunrise: Option<i64>,
    sunset: Option<i64>,
}

#[derive(Deserialize, Debug)]
struct MainInfo {
    temp: f64,
    feels_like: f64,
    temp_min: f64,
    temp_max: f64,
    humidity: u32,
    pressure: u32,
}

#[derive(Deserialize, Debug)]
struct WeatherInfo {
    description: String,
    icon: String,
}

#[derive(Deserialize, Debug)]
struct WindInfo {
    speed: f64,
    deg: Option<u32>,
}

#[derive(Deserialize, Debug)]
struct CloudsInfo {
    all: u32,
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
    let url = format!(
        "https://api.openweathermap.org/data/2.5/weather?lat={}&lon={}&appid={}&units=metric&lang=pt_br",
        lat, lon, API_KEY
    );

    // Use blocking HTTP request
    match ureq::get(&url).call() {
        Ok(response) => match response.into_json::<OpenWeatherResponse>() {
            Ok(data) => {
                let weather_info = data.weather.first();
                WeatherData {
                    loaded: true,
                    city: data.name,
                    country: data.sys.country.unwrap_or_default(),
                    temperature: data.main.temp,
                    feels_like: data.main.feels_like,
                    temp_min: data.main.temp_min,
                    temp_max: data.main.temp_max,
                    humidity: data.main.humidity,
                    pressure: data.main.pressure,
                    description: weather_info
                        .map(|w| w.description.clone())
                        .unwrap_or_default(),
                    icon: weather_info.map(|w| w.icon.clone()).unwrap_or_default(),
                    wind_speed: data.wind.speed,
                    wind_deg: data.wind.deg.unwrap_or(0),
                    clouds: data.clouds.all,
                    visibility: data.visibility.unwrap_or(10000),
                    sunrise: data.sys.sunrise.unwrap_or(0),
                    sunset: data.sys.sunset.unwrap_or(0),
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

/// Get weather icon URL
pub fn get_weather_icon_url(icon: &str) -> String {
    format!("https://openweathermap.org/img/wn/{}@2x.png", icon)
}

/// Get current location from IP address
pub fn get_current_location() -> LocationData {
    // Use ipapi.co free API for IP geolocation
    let url = "https://ipapi.co/json/";

    match ureq::get(url).call() {
        Ok(response) => match response.into_json::<IpApiResponse>() {
            Ok(data) => LocationData {
                latitude: data.latitude.unwrap_or(0.0),
                longitude: data.longitude.unwrap_or(0.0),
                city: data.city.unwrap_or_default(),
                region: data.region.unwrap_or_default(),
                country: data.country_name.unwrap_or_default(),
                success: data.latitude.is_some() && data.longitude.is_some(),
            },
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
