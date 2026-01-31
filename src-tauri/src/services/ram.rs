//! RAM monitoring service using Windows APIs

use serde::Serialize;
use crate::services::wmi_service::CachedSystemData;

#[derive(Serialize, Clone, Debug)]
pub struct RamData {
    /// Total physical memory in bytes
    pub total_bytes: u64,
    /// Available physical memory in bytes
    pub available_bytes: u64,
    /// Used physical memory in bytes
    pub used_bytes: u64,
    /// Memory usage percentage (0-100)
    pub usage_percent: f32,
    /// RAM voltage in mV (if available)
    pub voltage_mv: Option<u32>,
    /// RAM temperature in Celsius (if available)
    pub temperature_c: Option<f32>,
    /// Memory speed in MHz (if available)
    pub speed_mhz: Option<u32>,
}

impl Default for RamData {
    fn default() -> Self {
        Self {
            total_bytes: 0,
            available_bytes: 0,
            used_bytes: 0,
            usage_percent: 0.0,
            voltage_mv: None,
            temperature_c: None,
            speed_mhz: None,
        }
    }
}

/// Get RAM information using cached WMI data + Windows API
pub fn get_ram_info_cached(cached: &CachedSystemData) -> RamData {
    let mut data = RamData::default();
    
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        
        let mut mem_status = MEMORYSTATUSEX::default();
        mem_status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        
        unsafe {
            if GlobalMemoryStatusEx(&mut mem_status).is_ok() {
                data.total_bytes = mem_status.ullTotalPhys;
                data.available_bytes = mem_status.ullAvailPhys;
                data.used_bytes = mem_status.ullTotalPhys - mem_status.ullAvailPhys;
                data.usage_percent = mem_status.dwMemoryLoad as f32;
            }
        }
    }
    
    // Use cached RAM speed from WMI
    if cached.ram_speed_mhz > 0 {
        data.speed_mhz = Some(cached.ram_speed_mhz);
    }
    
    data
}

/// Get RAM information using Windows APIs (legacy sync version)
pub fn get_ram_info() -> Result<RamData, String> {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        
        let mut mem_status = MEMORYSTATUSEX::default();
        mem_status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        
        unsafe {
            GlobalMemoryStatusEx(&mut mem_status)
                .map_err(|e| e.to_string())?;
        }
        
        let data = RamData {
            total_bytes: mem_status.ullTotalPhys,
            available_bytes: mem_status.ullAvailPhys,
            used_bytes: mem_status.ullTotalPhys - mem_status.ullAvailPhys,
            usage_percent: mem_status.dwMemoryLoad as f32,
            voltage_mv: None,
            temperature_c: None,
            speed_mhz: None, // Skip WMI query for sync version
        };
        
        Ok(data)
    }
    
    #[cfg(not(windows))]
    {
        Err("RAM monitoring only supported on Windows".to_string())
    }
}

