//! CPU monitoring service using Windows APIs

use serde::Serialize;
use crate::services::wmi_service::CachedSystemData;

#[derive(Serialize, Clone, Debug)]
pub struct CpuData {
    /// CPU model name
    pub name: String,
    /// Total CPU usage percentage (0-100)
    pub total_usage: f32,
    /// Usage per core (0-100 each)
    pub per_core_usage: Vec<f32>,
    /// Number of logical processors
    pub logical_cores: u32,
    /// Number of physical cores
    pub physical_cores: u32,
    /// CPU temperature in Celsius (if available)
    pub temperature_c: Option<f32>,
    /// CPU power draw in Watts (if available)
    pub power_draw_w: Option<f32>,
    /// CPU voltage in mV (if available)
    pub voltage_mv: Option<u32>,
    /// Current clock speed in MHz
    pub clock_mhz: Option<u32>,
}

impl Default for CpuData {
    fn default() -> Self {
        Self {
            name: "Unknown CPU".to_string(),
            total_usage: 0.0,
            per_core_usage: vec![],
            logical_cores: 0,
            physical_cores: 0,
            temperature_c: None,
            power_draw_w: None,
            voltage_mv: None,
            clock_mhz: None,
        }
    }
}

/// Get CPU information using cached WMI data
pub fn get_cpu_info_cached(cached: &CachedSystemData) -> CpuData {
    let mut data = CpuData::default();
    
    // Get system info for core count
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::{GetSystemInfo, SYSTEM_INFO};
        
        let mut sys_info = SYSTEM_INFO::default();
        unsafe { GetSystemInfo(&mut sys_info) };
        data.logical_cores = sys_info.dwNumberOfProcessors;
        data.physical_cores = sys_info.dwNumberOfProcessors;
    }
    
    // Use cached WMI data
    data.name = cached.cpu_name.clone();
    data.total_usage = cached.cpu_usage;
    if cached.cpu_clock_mhz > 0 {
        data.clock_mhz = Some(cached.cpu_clock_mhz);
    }
    
    // Temperature from WMI thermal zone
    data.temperature_c = cached.cpu_temperature_c;
    
    // Fallback for empty name
    if data.name.is_empty() {
        data.name = "Loading...".to_string();
    }
    
    data
}

/// Legacy sync function - now just returns defaults quickly
pub fn get_cpu_info() -> Result<CpuData, String> {
    let mut data = CpuData::default();
    
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::{GetSystemInfo, SYSTEM_INFO};
        
        let mut sys_info = SYSTEM_INFO::default();
        unsafe { GetSystemInfo(&mut sys_info) };
        data.logical_cores = sys_info.dwNumberOfProcessors;
        data.physical_cores = sys_info.dwNumberOfProcessors;
    }
    
    Ok(data)
}
