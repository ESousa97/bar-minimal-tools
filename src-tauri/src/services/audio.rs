//! Audio service for Windows Core Audio API

use serde::Serialize;
use windows::{
    core::{IUnknown, Interface, GUID, HRESULT, PCWSTR, PROPVARIANT},
    Win32::{
        Devices::FunctionDiscovery::PKEY_Device_FriendlyName,
        Media::Audio::{
            eCapture, eConsole, eRender, Endpoints::IAudioEndpointVolume, IMMDevice,
            IMMDeviceCollection, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
        },
        UI::Shell::PropertiesSystem::IPropertyStore,
    },
};

// Windows Core Audio roles.
// We set all roles so apps that query different roles update immediately.
#[repr(i32)]
#[allow(dead_code, non_camel_case_types)]
enum ERole {
    eConsole = 0,
    eMultimedia = 1,
    eCommunications = 2,
}

// Undocumented PolicyConfig interface used to change the default audio endpoint.
// This is a common approach used by many Windows audio switchers.
// Ref: IPolicyConfig / IPolicyConfigVista (varies by Windows version)
#[repr(transparent)]
#[derive(Clone, Debug)]
struct IPolicyConfig(IUnknown);

unsafe impl Interface for IPolicyConfig {
    type Vtable = IPolicyConfig_Vtbl;
    // IID for IPolicyConfig (commonly used)
    const IID: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
}

#[repr(C)]
#[allow(non_camel_case_types, non_snake_case)]
struct IPolicyConfig_Vtbl {
    pub base__: <IUnknown as Interface>::Vtable,

    // The vtable has many methods; we only need SetDefaultEndpoint.
    // To keep indices correct, we include placeholders up to the method.
    // Signatures are HRESULT returning.
    pub _unused0: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused1: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused2: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused3: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused4: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused5: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused6: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused7: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused8: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,
    pub _unused9: unsafe extern "system" fn(*mut core::ffi::c_void) -> HRESULT,

    pub SetDefaultEndpoint: unsafe extern "system" fn(
        this: *mut core::ffi::c_void,
        device_id: PCWSTR,
        role: ERole,
    ) -> HRESULT,
}

// CLSID for PolicyConfigClient
const CLSID_POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[derive(Serialize, Clone, Debug)]
pub struct AudioDevice {
    /// Device ID
    pub id: String,
    /// Friendly name
    pub name: String,
    /// Is this the default device
    pub is_default: bool,
    /// Current volume (0-100)
    pub volume: u32,
    /// Is muted
    pub is_muted: bool,
    /// Device type: "output" or "input"
    pub device_type: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct AudioData {
    /// List of output devices
    pub output_devices: Vec<AudioDevice>,
    /// List of input devices  
    pub input_devices: Vec<AudioDevice>,
    /// Current default output device ID
    pub default_output_id: Option<String>,
    /// Current default input device ID
    pub default_input_id: Option<String>,
    /// Master volume (0-100)
    pub master_volume: u32,
    /// Is master muted
    pub is_muted: bool,
}

impl Default for AudioData {
    fn default() -> Self {
        Self {
            output_devices: vec![],
            input_devices: vec![],
            default_output_id: None,
            default_input_id: None,
            master_volume: 100,
            is_muted: false,
        }
    }
}

/// Get device friendly name from IMMDevice
unsafe fn get_device_name(device: &IMMDevice) -> String {
    let store: IPropertyStore = match device.OpenPropertyStore(STGM_READ) {
        Ok(s) => s,
        Err(_) => return "Unknown Device".to_string(),
    };

    let prop: PROPVARIANT = match store.GetValue(&PKEY_Device_FriendlyName) {
        Ok(p) => p,
        Err(_) => return "Unknown Device".to_string(),
    };

    // Convert PROPVARIANT to string - returns String directly via Display trait
    let name = prop.to_string();
    if name.is_empty() {
        "Unknown Device".to_string()
    } else {
        name
    }
}

/// Get device ID from IMMDevice
unsafe fn get_device_id(device: &IMMDevice) -> String {
    match device.GetId() {
        Ok(id) => {
            let pwstr = id.0;
            if !pwstr.is_null() {
                let len = (0..).take_while(|&i| *pwstr.offset(i) != 0).count();
                let slice = std::slice::from_raw_parts(pwstr, len);
                let result = String::from_utf16_lossy(slice);
                windows::Win32::System::Com::CoTaskMemFree(Some(pwstr as *const _));
                result
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    }
}

/// Get volume endpoint from device
unsafe fn get_volume_endpoint(device: &IMMDevice) -> Option<IAudioEndpointVolume> {
    device
        .Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        .ok()
}

/// Get audio devices of a specific type
unsafe fn get_devices_by_type(
    enumerator: &IMMDeviceEnumerator,
    data_flow: windows::Win32::Media::Audio::EDataFlow,
    default_id: &Option<String>,
    device_type: &str,
) -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    let collection: IMMDeviceCollection =
        match enumerator.EnumAudioEndpoints(data_flow, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return devices,
        };

    let count = match collection.GetCount() {
        Ok(c) => c,
        Err(_) => return devices,
    };

    for i in 0..count {
        if let Ok(device) = collection.Item(i) {
            let id = get_device_id(&device);
            let name = get_device_name(&device);
            let is_default = default_id.as_ref().map_or(false, |d| d == &id);

            let (volume, is_muted) = if let Some(endpoint) = get_volume_endpoint(&device) {
                let vol = endpoint.GetMasterVolumeLevelScalar().unwrap_or(1.0);
                let muted = endpoint
                    .GetMute()
                    .unwrap_or(windows::Win32::Foundation::FALSE)
                    .as_bool();
                ((vol * 100.0) as u32, muted)
            } else {
                (100, false)
            };

            devices.push(AudioDevice {
                id,
                name,
                is_default,
                volume,
                is_muted,
                device_type: device_type.to_string(),
            });
        }
    }

    devices
}

/// Get all audio data
pub fn get_audio_data() -> AudioData {
    unsafe {
        // Initialize COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(_) => return AudioData::default(),
            };

        // Get default output device ID
        let default_output_id = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .ok()
            .map(|d| get_device_id(&d));

        // Get default input device ID
        let default_input_id = enumerator
            .GetDefaultAudioEndpoint(eCapture, eConsole)
            .ok()
            .map(|d| get_device_id(&d));

        // Get master volume from default output
        let (master_volume, is_muted) =
            if let Ok(default_device) = enumerator.GetDefaultAudioEndpoint(eRender, eConsole) {
                if let Some(endpoint) = get_volume_endpoint(&default_device) {
                    let vol = endpoint.GetMasterVolumeLevelScalar().unwrap_or(1.0);
                    let muted = endpoint
                        .GetMute()
                        .unwrap_or(windows::Win32::Foundation::FALSE)
                        .as_bool();
                    ((vol * 100.0) as u32, muted)
                } else {
                    (100, false)
                }
            } else {
                (100, false)
            };

        // Get all output devices
        let output_devices =
            get_devices_by_type(&enumerator, eRender, &default_output_id, "output");

        // Get all input devices
        let input_devices = get_devices_by_type(&enumerator, eCapture, &default_input_id, "input");

        AudioData {
            output_devices,
            input_devices,
            default_output_id,
            default_input_id,
            master_volume,
            is_muted,
        }
    }
}

/// Set the master volume (0-100)
pub fn set_master_volume(volume: u32) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;

        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;

        let level = (volume.min(100) as f32) / 100.0;
        endpoint
            .SetMasterVolumeLevelScalar(level, std::ptr::null())
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// Toggle mute on master volume
pub fn toggle_mute() -> Result<bool, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| e.to_string())?;

        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;

        let current_mute = endpoint.GetMute().map_err(|e| e.to_string())?.as_bool();

        let new_mute = !current_mute;
        endpoint
            .SetMute(new_mute, std::ptr::null())
            .map_err(|e| e.to_string())?;

        Ok(new_mute)
    }
}

/// Set volume for a specific device
pub fn set_device_volume(device_id: &str, volume: u32) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| e.to_string())?;

        // Convert device_id to wide string
        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();

        let device = enumerator
            .GetDevice(PCWSTR::from_raw(wide_id.as_ptr()))
            .map_err(|e| e.to_string())?;

        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?;

        let level = (volume.min(100) as f32) / 100.0;
        endpoint
            .SetMasterVolumeLevelScalar(level, std::ptr::null())
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// Set the default output or input device (Windows default audio endpoint)
pub fn set_default_device(device_id: &str) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // Convert device_id to wide string
        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let device_pwstr = PCWSTR::from_raw(wide_id.as_ptr());

        let policy: IPolicyConfig = CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)
            .map_err(|e| e.to_string())?;

        // Apply for all roles.
        (policy.vtable().SetDefaultEndpoint)(
            policy.as_raw() as *mut _,
            device_pwstr,
            ERole::eConsole,
        )
        .ok()
        .map_err(|e| e.to_string())?;
        (policy.vtable().SetDefaultEndpoint)(
            policy.as_raw() as *mut _,
            device_pwstr,
            ERole::eMultimedia,
        )
        .ok()
        .map_err(|e| e.to_string())?;
        (policy.vtable().SetDefaultEndpoint)(
            policy.as_raw() as *mut _,
            device_pwstr,
            ERole::eCommunications,
        )
        .ok()
        .map_err(|e| e.to_string())?;

        Ok(())
    }
}
