//! Headset service for Corsair iCUE SDK integration
//! Provides battery level, mic, equalizer, surround sound, and sidetone control for Corsair headsets

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

#[cfg(windows)]
use libloading::Library;

#[cfg(windows)]
fn verbose_logs_enabled() -> bool {
    std::env::var_os("BAR_VERBOSE_LOGS").is_some()
}

/// Status of the headset connection
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum HeadsetStatus {
    /// Headset is connected and active
    Connected,
    /// Headset is off/disconnected
    Disconnected,
    /// Headset is charging
    Charging,
    /// Unable to determine status
    Unknown,
}

/// Equalizer preset options (1-5)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum EqualizerPreset {
    Pure = 1,
    Bass = 2,
    Movie = 3,
    FPS = 4,
    Custom = 5,
}

impl From<i32> for EqualizerPreset {
    fn from(value: i32) -> Self {
        match value {
            1 => EqualizerPreset::Pure,
            2 => EqualizerPreset::Bass,
            3 => EqualizerPreset::Movie,
            4 => EqualizerPreset::FPS,
            5 => EqualizerPreset::Custom,
            _ => EqualizerPreset::Pure,
        }
    }
}

/// Headset data structure
#[derive(Serialize, Clone, Debug)]
pub struct HeadsetData {
    /// Device name (e.g., "CORSAIR VOID RGB ELITE")
    pub name: String,
    /// Device ID for SDK operations
    pub device_id: String,
    /// Battery percentage (0-100)
    pub battery_percent: u8,
    /// Current status
    pub status: HeadsetStatus,
    /// Is the headset currently charging
    pub is_charging: bool,
    /// Is iCUE SDK available
    pub sdk_available: bool,
    /// Microphone enabled
    pub mic_enabled: bool,
    /// Surround sound enabled (7.1)
    pub surround_sound_enabled: bool,
    /// Sidetone enabled (hear your own voice)
    pub sidetone_enabled: bool,
    /// Current equalizer preset (1-5)
    pub equalizer_preset: i32,
    /// Number of controllable LEDs on the device (0 if none / unknown)
    pub led_count: i32,
    /// Available properties (what this device supports)
    pub supported_features: HeadsetFeatures,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug)]
struct BatteryChargeHeuristic {
    last_level: u8,
    charging_until: Option<Instant>,
}

#[cfg(windows)]
static BATTERY_STATE: OnceLock<Mutex<HashMap<String, BatteryChargeHeuristic>>> = OnceLock::new();

/// Features supported by this headset
#[derive(Serialize, Clone, Debug, Default)]
pub struct HeadsetFeatures {
    pub has_battery: bool,
    pub has_mic_toggle: bool,
    pub has_surround_sound: bool,
    pub has_sidetone: bool,
    pub has_equalizer: bool,
    pub has_lighting: bool,
}

impl Default for HeadsetData {
    fn default() -> Self {
        Self {
            name: String::new(),
            device_id: String::new(),
            battery_percent: 0,
            status: HeadsetStatus::Disconnected,
            is_charging: false,
            sdk_available: false,
            mic_enabled: false,
            surround_sound_enabled: false,
            sidetone_enabled: false,
            equalizer_preset: 1,
            led_count: 0,
            supported_features: HeadsetFeatures::default(),
        }
    }
}

// iCUE SDK Constants based on iCUESDK.h
#[cfg(windows)]
#[allow(dead_code)]
mod cue_sdk {
    pub const CORSAIR_STRING_SIZE_M: usize = 128;
    pub const CORSAIR_DEVICE_COUNT_MAX: usize = 64;

    // Device types (bitmask)
    pub const CDT_HEADSET: i32 = 0x0008;
    pub const CDT_HEADSET_STAND: i32 = 0x0010;

    // Error codes
    pub const CE_SUCCESS: i32 = 0;

    // Property IDs
    pub const CDPI_MIC_ENABLED: i32 = 2;
    pub const CDPI_SURROUND_SOUND_ENABLED: i32 = 3;
    pub const CDPI_SIDETONE_ENABLED: i32 = 4;
    pub const CDPI_EQUALIZER_PRESET: i32 = 5;
    pub const CDPI_BATTERY_LEVEL: i32 = 9;

    // Data types
    pub const CT_BOOLEAN: i32 = 0;
    pub const CT_INT32: i32 = 1;

    // Property flags
    pub const CPF_CAN_READ: u32 = 0x01;
}

#[cfg(windows)]
static SDK_AVAILABLE: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
static SESSION_STATE: AtomicI32 = AtomicI32::new(0);

#[cfg(windows)]
static SDK_LIBRARY: OnceLock<Library> = OnceLock::new();

// FFI structures matching iCUESDK.h
#[cfg(windows)]
#[repr(C)]
#[derive(Clone)]
struct CorsairDeviceInfo {
    device_type: i32,
    id: [u8; 128],
    serial: [u8; 128],
    model: [u8; 128],
    led_count: i32,
    channel_count: i32,
}

#[cfg(windows)]
#[repr(C)]
struct CorsairDeviceFilter {
    device_type_mask: i32,
}

#[cfg(windows)]
#[repr(C)]
struct CorsairVersion {
    major: i32,
    minor: i32,
    patch: i32,
}

#[cfg(windows)]
#[repr(C)]
struct CorsairSessionDetails {
    client_version: CorsairVersion,
    server_version: CorsairVersion,
    server_host_version: CorsairVersion,
}

#[cfg(windows)]
#[repr(C)]
struct CorsairSessionStateChanged {
    state: i32,
    details: CorsairSessionDetails,
}

#[cfg(windows)]
#[repr(C)]
union CorsairDataValue {
    boolean: bool,
    int32: i32,
    float64: f64,
    string: *mut i8,
}

#[cfg(windows)]
#[repr(C)]
struct CorsairProperty {
    type_: i32,
    value: CorsairDataValue,
}

// Type definitions for SDK functions
#[cfg(windows)]
type CorsairConnectFn = unsafe extern "C" fn(
    callback: Option<unsafe extern "C" fn(*mut std::ffi::c_void, *const CorsairSessionStateChanged)>,
    context: *mut std::ffi::c_void,
) -> i32;

#[cfg(windows)]
type CorsairGetDevicesFn = unsafe extern "C" fn(
    filter: *const CorsairDeviceFilter,
    size_max: i32,
    devices: *mut CorsairDeviceInfo,
    size: *mut i32,
) -> i32;

#[cfg(windows)]
type CorsairReadDevicePropertyFn = unsafe extern "C" fn(
    device_id: *const u8,
    property_id: i32,
    index: u32,
    property: *mut CorsairProperty,
) -> i32;

#[cfg(windows)]
type CorsairFreePropertyFn = unsafe extern "C" fn(property: *mut CorsairProperty) -> i32;

#[cfg(windows)]
type CorsairGetDevicePropertyInfoFn = unsafe extern "C" fn(
    device_id: *const u8,
    property_id: i32,
    index: u32,
    data_type: *mut i32,
    flags: *mut u32,
) -> i32;

/// Session state change callback
#[cfg(windows)]
unsafe extern "C" fn on_session_state_changed(
    _context: *mut std::ffi::c_void,
    event_data: *const CorsairSessionStateChanged,
) {
    if !event_data.is_null() {
        let state = (*event_data).state;
        SESSION_STATE.store(state, Ordering::SeqCst);
        if verbose_logs_enabled() {
            eprintln!("iCUE session state changed: {}", state);
        }
    }
}

/// Get SDK DLL path - looks in project libs folder first
#[cfg(windows)]
fn get_sdk_dll_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    // Get the executable directory
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    // Possible paths to search
    let mut paths = vec![
        // Same folder as exe
        exe_dir.clone().map(|p| p.join("iCUESDK.x64_2019.dll")),
        // Project libs folder (relative to exe in debug)
        exe_dir
            .clone()
            .map(|p| p.join("..\\..\\..\\libs\\iCUESDK\\iCUESDK.x64_2019.dll")),
        // Src-tauri libs (when running from project root)
        Some(PathBuf::from(
            r".\src-tauri\libs\iCUESDK\iCUESDK.x64_2019.dll",
        )),
        Some(PathBuf::from(
            r"src-tauri\libs\iCUESDK\iCUESDK.x64_2019.dll",
        )),
        Some(PathBuf::from(r"libs\iCUESDK\iCUESDK.x64_2019.dll")),
    ];

    // Also add iCUE installation paths as fallback
    paths.extend(vec![
        Some(PathBuf::from(
            r"C:\Program Files\Corsair\CORSAIR iCUE 5 Software\iCUESDK.x64_2019.dll",
        )),
        Some(PathBuf::from(
            r"C:\Program Files\Corsair\CORSAIR iCUE 4 Software\iCUESDK.x64_2019.dll",
        )),
    ]);

    for path_opt in paths {
        if let Some(path) = path_opt {
            // Normalize the path
            if let Ok(canonical) = std::fs::canonicalize(&path) {
                if verbose_logs_enabled() {
                    eprintln!("Found iCUE SDK at: {:?}", canonical);
                }
                return Some(canonical);
            } else if path.exists() {
                if verbose_logs_enabled() {
                    eprintln!("Found iCUE SDK at: {:?}", path);
                }
                return Some(path);
            }
        }
    }

    if verbose_logs_enabled() {
        eprintln!("iCUE SDK DLL not found in any location");
    }
    None
}

/// Initialize the SDK (called once)
#[cfg(windows)]
fn initialize_sdk() -> bool {
    // If already initialized, return status
    if SDK_LIBRARY.get().is_some() {
        return SDK_AVAILABLE.load(Ordering::SeqCst);
    }

    let dll_path = match get_sdk_dll_path() {
        Some(p) => p,
        None => {
            if verbose_logs_enabled() {
                eprintln!("iCUE SDK not found - headset monitoring disabled");
            }
            return false;
        }
    };

    unsafe {
        match Library::new(&dll_path) {
            Ok(lib) => {
                if verbose_logs_enabled() {
                    eprintln!("iCUE SDK loaded successfully from: {:?}", dll_path);
                }

                // Get CorsairConnect function
                let connect: Result<libloading::Symbol<CorsairConnectFn>, _> =
                    lib.get(b"CorsairConnect");

                if let Ok(connect_fn) = connect {
                    let result = connect_fn(Some(on_session_state_changed), std::ptr::null_mut());

                    if result == cue_sdk::CE_SUCCESS {
                        if verbose_logs_enabled() {
                            eprintln!("CorsairConnect succeeded");
                        }
                        let _ = SDK_LIBRARY.set(lib);
                        SDK_AVAILABLE.store(true, Ordering::SeqCst);

                        // Wait a bit for connection to establish
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        return true;
                    } else {
                        eprintln!("CorsairConnect failed with error: {}", result);
                    }
                } else {
                    eprintln!("Failed to get CorsairConnect function");
                }
            }
            Err(e) => {
                eprintln!("Failed to load iCUE SDK: {:?}", e);
            }
        }
    }

    false
}

/// Helper to read a boolean property
#[cfg(windows)]
unsafe fn read_bool_property(
    read_property: &libloading::Symbol<CorsairReadDevicePropertyFn>,
    free_property: &libloading::Symbol<CorsairFreePropertyFn>,
    device_id: *const u8,
    property_id: i32,
) -> Option<bool> {
    let mut property: CorsairProperty = std::mem::zeroed();
    let result = read_property(device_id, property_id, 0, &mut property);

    if result == cue_sdk::CE_SUCCESS {
        let value = property.value.boolean;
        free_property(&mut property as *mut _);
        Some(value)
    } else {
        None
    }
}

/// Helper to read an int32 property
#[cfg(windows)]
unsafe fn read_int32_property(
    read_property: &libloading::Symbol<CorsairReadDevicePropertyFn>,
    free_property: &libloading::Symbol<CorsairFreePropertyFn>,
    device_id: *const u8,
    property_id: i32,
) -> Option<i32> {
    let mut property: CorsairProperty = std::mem::zeroed();
    let result = read_property(device_id, property_id, 0, &mut property);

    if result == cue_sdk::CE_SUCCESS {
        let value = property.value.int32;
        free_property(&mut property as *mut _);
        Some(value)
    } else {
        None
    }
}

#[cfg(windows)]
fn infer_is_charging(device_id: &str, battery_level: u8) -> bool {
    // Heuristic: iCUE SDK v4 doesn't expose a dedicated "charging" flag.
    // If battery level increases between polls, treat as charging for a short grace window.
    let now = Instant::now();
    let map = BATTERY_STATE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = match map.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };

    let prev = map.get(device_id).copied();
    let mut charging = false;

    if let Some(prev) = prev {
        // reset heuristic if device stopped reporting meaningful values
        if battery_level == 0 {
            charging = false;
        } else if battery_level > prev.last_level && battery_level < 100 {
            charging = true;
        } else if let Some(until) = prev.charging_until {
            if until > now && battery_level < 100 {
                charging = true;
            }
        }
    }

    let charging_until = if charging {
        Some(now + Duration::from_secs(90))
    } else {
        None
    };

    map.insert(
        device_id.to_string(),
        BatteryChargeHeuristic {
            last_level: battery_level,
            charging_until,
        },
    );

    charging
}

/// Check if a property is readable
#[cfg(windows)]
unsafe fn get_property_info(
    get_property_info_fn: &libloading::Symbol<CorsairGetDevicePropertyInfoFn>,
    device_id: *const u8,
    property_id: i32,
) -> (bool, bool) {
    let mut data_type: i32 = 0;
    let mut flags: u32 = 0;

    let result = get_property_info_fn(device_id, property_id, 0, &mut data_type, &mut flags);

    if result == cue_sdk::CE_SUCCESS {
        let can_read = (flags & cue_sdk::CPF_CAN_READ) != 0;
        (can_read, false) // We no longer support write operations
    } else {
        (false, false)
    }
}

/// Get headset data using iCUE SDK
#[cfg(windows)]
pub fn get_headset_data() -> HeadsetData {
    // Initialize SDK if not done
    if !initialize_sdk() {
        return HeadsetData::default();
    }

    unsafe {
        let lib = match SDK_LIBRARY.get() {
            Some(l) => l,
            None => return HeadsetData::default(),
        };

        // Get function pointers
        let get_devices: libloading::Symbol<CorsairGetDevicesFn> =
            match lib.get(b"CorsairGetDevices") {
                Ok(f) => f,
                Err(_) => {
                    return HeadsetData {
                        sdk_available: true,
                        ..Default::default()
                    }
                }
            };

        let read_property: libloading::Symbol<CorsairReadDevicePropertyFn> =
            match lib.get(b"CorsairReadDeviceProperty") {
                Ok(f) => f,
                Err(_) => {
                    return HeadsetData {
                        sdk_available: true,
                        ..Default::default()
                    }
                }
            };

        let free_property: libloading::Symbol<CorsairFreePropertyFn> =
            match lib.get(b"CorsairFreeProperty") {
                Ok(f) => f,
                Err(_) => {
                    return HeadsetData {
                        sdk_available: true,
                        ..Default::default()
                    }
                }
            };

        let get_property_info_fn: libloading::Symbol<CorsairGetDevicePropertyInfoFn> =
            match lib.get(b"CorsairGetDevicePropertyInfo") {
                Ok(f) => f,
                Err(_) => {
                    return HeadsetData {
                        sdk_available: true,
                        ..Default::default()
                    }
                }
            };

        // Create filter for headsets
        let filter = CorsairDeviceFilter {
            device_type_mask: cue_sdk::CDT_HEADSET | cue_sdk::CDT_HEADSET_STAND,
        };

        // Get devices
        let mut devices: [CorsairDeviceInfo; 64] = std::mem::zeroed();
        let mut device_count: i32 = 0;

        let result = get_devices(&filter, 64, devices.as_mut_ptr(), &mut device_count);

        if result != cue_sdk::CE_SUCCESS {
            eprintln!("CorsairGetDevices failed with error: {}", result);
            return HeadsetData {
                sdk_available: true,
                status: HeadsetStatus::Disconnected,
                ..Default::default()
            };
        }

        if device_count == 0 {
            return HeadsetData {
                sdk_available: true,
                status: HeadsetStatus::Disconnected,
                ..Default::default()
            };
        }

        // Process first headset found
        let device = &devices[0];
        let device_id_ptr = device.id.as_ptr();
        let led_count = device.led_count;

        // Get device name
        let name = std::ffi::CStr::from_ptr(device.model.as_ptr() as *const i8)
            .to_string_lossy()
            .to_string();

        // Get device ID string for later use
        let device_id = std::ffi::CStr::from_ptr(device.id.as_ptr() as *const i8)
            .to_string_lossy()
            .to_string();

        // Check supported features (read-only)
        let (has_battery, _) = get_property_info(
            &get_property_info_fn,
            device_id_ptr,
            cue_sdk::CDPI_BATTERY_LEVEL,
        );
        let (has_mic, _) = get_property_info(
            &get_property_info_fn,
            device_id_ptr,
            cue_sdk::CDPI_MIC_ENABLED,
        );

        let supported_features = HeadsetFeatures {
            has_battery,
            has_mic_toggle: has_mic,
            has_surround_sound: false,
            has_sidetone: false,
            has_equalizer: false,
            has_lighting: led_count > 0,
        };

        // Read battery level
        let battery_level = read_int32_property(
            &read_property,
            &free_property,
            device_id_ptr,
            cue_sdk::CDPI_BATTERY_LEVEL,
        )
        .map(|v| v.clamp(0, 100) as u8)
        .unwrap_or(0);

        // Read mic status
        let mic_enabled = read_bool_property(
            &read_property,
            &free_property,
            device_id_ptr,
            cue_sdk::CDPI_MIC_ENABLED,
        )
        .unwrap_or(false);

        // Infer charging based on battery trend (SDK doesn't expose charging directly)
        let is_charging = if has_battery && !device_id.is_empty() {
            infer_is_charging(&device_id, battery_level)
        } else {
            false
        };

        // Determine status
        let status = if battery_level == 0 {
            HeadsetStatus::Disconnected
        } else if is_charging {
            HeadsetStatus::Charging
        } else {
            HeadsetStatus::Connected
        };

        HeadsetData {
            name: if name.is_empty() {
                "Corsair Headset".to_string()
            } else {
                name
            },
            device_id,
            battery_percent: battery_level,
            status,
            is_charging,
            sdk_available: true,
            mic_enabled,
            surround_sound_enabled: false,
            sidetone_enabled: false,
            equalizer_preset: 1,
            led_count,
            supported_features,
        }
    }
}

/// Check if SDK is available
#[cfg(windows)]
pub fn is_sdk_available() -> bool {
    initialize_sdk()
}

/// Get SDK path if found
#[cfg(windows)]
pub fn get_sdk_path() -> Option<String> {
    get_sdk_dll_path().map(|p| p.to_string_lossy().to_string())
}

// ============ Non-Windows fallback implementations ============

#[cfg(not(windows))]
pub fn get_headset_data() -> HeadsetData {
    HeadsetData::default()
}

#[cfg(not(windows))]
pub fn is_sdk_available() -> bool {
    false
}

#[cfg(not(windows))]
pub fn get_sdk_path() -> Option<String> {
    None
}
