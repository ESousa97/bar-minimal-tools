//! Windows native thermal monitoring via WMI (ACPI + Perf Counters)

use std::collections::HashMap;
use wmi::{COMLibrary, Variant, WMIConnection};

/// Query ACPI thermal zone temperature (system thermal zone)
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

/// Query Windows thermal zone via Performance Counters
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

/// Get CPU temperature using Windows APIs only
pub fn get_windows_cpu_temperature() -> Option<f32> {
    // Prefer performance counters if available
    if let Ok(temp) = query_windows_thermal_zone() {
        return Some(temp);
    }

    // Fallback to ACPI thermal zone
    if let Ok(temp) = query_acpi_temperature() {
        return Some(temp);
    }

    None
}
