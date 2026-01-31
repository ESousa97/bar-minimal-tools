//! LibreHardwareMonitor integration for CPU temperature monitoring
//! 
//! This module provides CPU temperature reading using LibreHardwareMonitor.
//! It attempts multiple methods:
//! 1. WMI namespace (when LibreHardwareMonitor app is running)
//! 2. Direct WMI thermal zone (fallback, less accurate)

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use wmi::{COMLibrary, WMIConnection, Variant};

/// CPU temperature data from LibreHardwareMonitor
#[derive(Clone, Debug, Default)]
pub struct CpuTemperatureData {
    /// Package/die temperature (most accurate)
    pub package_temp_c: Option<f32>,
    /// Per-core temperatures
    pub core_temps_c: Vec<f32>,
    /// Average core temperature
    pub average_temp_c: Option<f32>,
    /// Max core temperature
    pub max_temp_c: Option<f32>,
}

/// Query CPU temperature via LibreHardwareMonitor WMI namespace
/// This requires LibreHardwareMonitor to be running in background
pub fn query_lhm_temperature() -> Result<CpuTemperatureData, String> {
    let com_lib = COMLibrary::new().map_err(|e| format!("COM init failed: {}", e))?;
    
    // Try LibreHardwareMonitor WMI namespace
    let wmi_con = WMIConnection::with_namespace_path("root\\LibreHardwareMonitor", com_lib)
        .map_err(|e| format!("LHM WMI connection failed: {}", e))?;
    
    // Query sensors - looking for CPU temperature sensors
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, SensorType, Value, Parent FROM Sensor WHERE SensorType='Temperature'")
        .map_err(|e| format!("LHM query failed: {}", e))?;
    
    let mut data = CpuTemperatureData::default();
    let mut core_temps: Vec<f32> = Vec::new();
    
    for sensor in results.iter() {
        let name = match sensor.get("Name") {
            Some(Variant::String(s)) => s.to_lowercase(),
            _ => continue,
        };
        
        let parent = match sensor.get("Parent") {
            Some(Variant::String(s)) => s.to_lowercase(),
            _ => String::new(),
        };
        
        // Only process CPU sensors
        if !parent.contains("cpu") && !name.contains("cpu") {
            continue;
        }
        
        let value: f32 = match sensor.get("Value") {
            Some(Variant::R4(v)) => *v,
            Some(Variant::R8(v)) => *v as f32,
            Some(Variant::I4(v)) => *v as f32,
            Some(Variant::UI4(v)) => *v as f32,
            _ => continue,
        };
        
        // Skip invalid readings
        if value <= 0.0 || value > 150.0 {
            continue;
        }
        
        // Categorize the temperature
        if name.contains("package") || name.contains("cpu package") {
            data.package_temp_c = Some(value);
        } else if name.contains("core #") || name.contains("cpu core") {
            core_temps.push(value);
        } else if name.contains("cpu") && data.package_temp_c.is_none() {
            // Generic CPU temperature
            data.package_temp_c = Some(value);
        }
    }
    
    if !core_temps.is_empty() {
        data.core_temps_c = core_temps.clone();
        let sum: f32 = core_temps.iter().sum();
        data.average_temp_c = Some(sum / core_temps.len() as f32);
        data.max_temp_c = core_temps.iter().cloned().fold(f32::MIN, f32::max).into();
    }
    
    // If we got package temp or core temps, consider it success
    if data.package_temp_c.is_some() || !data.core_temps_c.is_empty() {
        Ok(data)
    } else {
        Err("No CPU temperature sensors found in LHM".to_string())
    }
}

/// Query CPU temperature directly via LibreHardwareMonitorLib (PowerShell helper)
/// Useful when LHM UI crashes but the library can still access sensors.
#[cfg(windows)]
pub fn query_lhm_direct_temperature() -> Result<f32, String> {
    let script_path = find_lhm_direct_script()
        .ok_or("LHMDirect.ps1 not found")?;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to run LHMDirect.ps1: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("LHMDirect.ps1 failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("LHMDirect.ps1 returned empty output".to_string());
    }

    trimmed
        .parse::<f32>()
        .map_err(|e| format!("Failed to parse LHMDirect.ps1 output '{}': {}", trimmed, e))
}

#[cfg(not(windows))]
pub fn query_lhm_direct_temperature() -> Result<f32, String> {
    Err("LHMDirect is only supported on Windows".to_string())
}

/// Query CPU temperature via OpenHardwareMonitor WMI namespace (older version)
/// Some users might have OHM instead of LHM
pub fn query_ohm_temperature() -> Result<CpuTemperatureData, String> {
    let com_lib = COMLibrary::new().map_err(|e| format!("COM init failed: {}", e))?;
    
    let wmi_con = WMIConnection::with_namespace_path("root\\OpenHardwareMonitor", com_lib)
        .map_err(|e| format!("OHM WMI connection failed: {}", e))?;
    
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, SensorType, Value, Parent FROM Sensor WHERE SensorType='Temperature'")
        .map_err(|e| format!("OHM query failed: {}", e))?;
    
    let mut data = CpuTemperatureData::default();
    let mut core_temps: Vec<f32> = Vec::new();
    
    for sensor in results.iter() {
        let name = match sensor.get("Name") {
            Some(Variant::String(s)) => s.to_lowercase(),
            _ => continue,
        };
        
        let parent = match sensor.get("Parent") {
            Some(Variant::String(s)) => s.to_lowercase(),
            _ => String::new(),
        };
        
        if !parent.contains("cpu") && !name.contains("cpu") {
            continue;
        }
        
        let value: f32 = match sensor.get("Value") {
            Some(Variant::R4(v)) => *v,
            Some(Variant::R8(v)) => *v as f32,
            Some(Variant::I4(v)) => *v as f32,
            Some(Variant::UI4(v)) => *v as f32,
            _ => continue,
        };
        
        if value <= 0.0 || value > 150.0 {
            continue;
        }
        
        if name.contains("package") {
            data.package_temp_c = Some(value);
        } else if name.contains("core") {
            core_temps.push(value);
        }
    }
    
    if !core_temps.is_empty() {
        data.core_temps_c = core_temps.clone();
        let sum: f32 = core_temps.iter().sum();
        data.average_temp_c = Some(sum / core_temps.len() as f32);
        data.max_temp_c = core_temps.iter().cloned().fold(f32::MIN, f32::max).into();
    }
    
    if data.package_temp_c.is_some() || !data.core_temps_c.is_empty() {
        Ok(data)
    } else {
        Err("No CPU temperature sensors found in OHM".to_string())
    }
}

/// Query ACPI thermal zone temperature (fallback, less accurate)
/// This is the system thermal zone, not CPU-specific
pub fn query_acpi_temperature() -> Result<f32, String> {
    let com_lib = COMLibrary::new().map_err(|e| format!("COM init failed: {}", e))?;
    
    let wmi_con = WMIConnection::with_namespace_path("root\\WMI", com_lib)
        .map_err(|e| format!("WMI connection failed: {}", e))?;
    
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature")
        .map_err(|e| format!("ACPI query failed: {}", e))?;
    
    if let Some(thermal) = results.first() {
        let temp_value = match thermal.get("CurrentTemperature") {
            Some(Variant::UI4(v)) => *v as f32,
            Some(Variant::UI2(v)) => *v as f32,
            Some(Variant::I4(v)) => *v as f32,
            _ => return Err("Invalid temperature format".to_string()),
        };
        
        // Temperature is in tenths of Kelvin, convert to Celsius
        let celsius = (temp_value / 10.0) - 273.15;
        
        if celsius > 0.0 && celsius < 150.0 {
            return Ok(celsius);
        }
    }
    
    Err("No ACPI temperature data".to_string())
}

/// Query Windows native thermal zone via Performance Counters (alternative fallback)
pub fn query_windows_thermal_zone() -> Result<f32, String> {
    let com_lib = COMLibrary::new().map_err(|e| format!("COM init failed: {}", e))?;
    
    let wmi_con = WMIConnection::with_namespace_path("root\\cimv2", com_lib)
        .map_err(|e| format!("WMI connection failed: {}", e))?;
    
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, HighPrecisionTemperature, Temperature FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation")
        .map_err(|e| format!("Thermal query failed: {}", e))?;
    
    if let Some(zone) = results.first() {
        // HighPrecisionTemperature is in tenths of Kelvin
        let temp_value = match zone.get("HighPrecisionTemperature") {
            Some(Variant::UI8(v)) => *v as f32,
            Some(Variant::UI4(v)) => *v as f32,
            _ => {
                // Fallback to Temperature (in Kelvin)
                match zone.get("Temperature") {
                    Some(Variant::UI8(v)) => (*v as f32) * 10.0,
                    Some(Variant::UI4(v)) => (*v as f32) * 10.0,
                    _ => return Err("No temperature value".to_string()),
                }
            }
        };
        
        // Convert from tenths of Kelvin to Celsius
        let celsius = (temp_value / 10.0) - 273.15;
        
        if celsius > 0.0 && celsius < 150.0 {
            return Ok(celsius);
        }
    }
    
    Err("No thermal zone data".to_string())
}

/// Get the best available CPU temperature
/// Tries multiple sources in order of accuracy
pub fn get_best_cpu_temperature() -> Option<f32> {
    // Try LibreHardwareMonitor first (most accurate)
    match query_lhm_temperature() {
        Ok(data) => {
            if let Some(temp) = data.package_temp_c {
                return Some(temp);
            }
            if let Some(temp) = data.max_temp_c {
                return Some(temp);
            }
            if let Some(temp) = data.average_temp_c {
                return Some(temp);
            }
        }
        Err(_e) => {
            // LHM not available, try other sources
        }
    }

    // Try direct LHM library access (PowerShell helper)
    if let Ok(temp) = query_lhm_direct_temperature() {
        return Some(temp);
    }
    
    // Try OpenHardwareMonitor (older but still accurate)
    match query_ohm_temperature() {
        Ok(data) => {
            if let Some(temp) = data.package_temp_c {
                return Some(temp);
            }
            if let Some(temp) = data.max_temp_c {
                return Some(temp);
            }
            if let Some(temp) = data.average_temp_c {
                return Some(temp);
            }
        }
        Err(_e) => {
            // OHM not available
        }
    }
    
    // NO FALLBACK - only return real sensor data or None
    // User must run LibreHardwareMonitor for CPU temperature
    None
}

fn find_lhm_direct_script() -> Option<PathBuf> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            // dev source path (src-tauri/libs)
            if let Some(parent) = dir.parent() {
                if let Some(grandparent) = parent.parent() {
                    let dev = grandparent
                        .join("src-tauri")
                        .join("libs")
                        .join("LibreHardwareMonitor")
                        .join("LHMDirect.ps1");
                    if dev.exists() {
                        return Some(dev);
                    }
                }
            }

            // bundled libs path (target/debug or resources)
            let libs = dir
                .join("libs")
                .join("LibreHardwareMonitor")
                .join("LHMDirect.ps1");
            if libs.exists() {
                return Some(libs);
            }

            let resources = dir.join("resources").join("LHMDirect.ps1");
            if resources.exists() {
                return Some(resources);
            }
        }
    }

    // fallback to source tree
    let cwd = std::env::current_dir().ok()?;
    let fallback = cwd
        .join("src-tauri")
        .join("libs")
        .join("LibreHardwareMonitor")
        .join("LHMDirect.ps1");
    if fallback.exists() {
        return Some(fallback);
    }

    None
}
