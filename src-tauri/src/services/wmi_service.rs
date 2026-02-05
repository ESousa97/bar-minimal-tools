//! Shared WMI service with connection pooling and timeout handling
//! Also includes NVIDIA GPU monitoring via NVML

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use wmi::{Variant, WMIConnection};

use crate::services::pdh;

/// NVIDIA GPU data from NVML
#[derive(Clone, Debug, Default)]
pub struct NvidiaGpuData {
    pub name: String,
    pub temperature_c: u32,
    pub usage_percent: u32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub power_draw_w: u32,
    pub fan_speed_percent: u32,
    pub available: bool,
}

/// Network data for speed monitoring
#[derive(Clone, Debug, Default)]
pub struct CachedNetworkData {
    pub interface_name: String,
    pub download_bytes_sec: u64,
    pub upload_bytes_sec: u64,
    pub total_received: u64,
    pub total_sent: u64,
    pub is_connected: bool,
}

/// Cached system data to avoid blocking queries
#[derive(Clone, Debug, Default)]
pub struct CachedSystemData {
    pub cpu_name: String,
    pub cpu_usage: f32,
    pub cpu_clock_mhz: u32,
    pub gpu_name: String,
    pub gpu_vendor: String,
    pub gpu_usage_percent: f32,
    pub gpu_vram_mb: u64,
    pub gpu_vram_used_mb: u64,
    pub nvidia_gpu: NvidiaGpuData,
    pub ram_speed_mhz: u32,
    pub drives: Vec<CachedDriveInfo>,
    pub network: CachedNetworkData,
    pub last_updated: Option<Instant>,
}

#[derive(Clone, Debug)]
pub struct CachedDriveInfo {
    pub letter: String,
    pub label: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

/// WMI service that runs queries in background and caches results
pub struct WmiService {
    cache: Arc<Mutex<CachedSystemData>>,
    is_running: Arc<Mutex<bool>>,
}

impl Default for WmiService {
    fn default() -> Self {
        Self::new()
    }
}

impl WmiService {
    pub fn new() -> Self {
        let service = Self {
            cache: Arc::new(Mutex::new(CachedSystemData::default())),
            is_running: Arc::new(Mutex::new(false)),
        };

        // Start background update thread
        service.start_background_updates();

        service
    }

    fn start_background_updates(&self) {
        let cache = Arc::clone(&self.cache);
        let is_running = Arc::clone(&self.is_running);

        thread::spawn(move || {
            // Create WMI connection (COM is initialized internally in wmi 0.18+)
            let wmi_con = match WMIConnection::new() {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Failed to create WMI connection: {}", e);
                    return;
                }
            };

            // Initialize NVML for NVIDIA GPU monitoring
            let nvml = nvml_wrapper::Nvml::init().ok();
            let nvidia_device = nvml.as_ref().and_then(|n| n.device_by_index(0).ok());

            {
                let mut running = is_running.lock().unwrap();
                *running = true;
            }

            loop {
                // Query all data in this thread with the persistent connection
                let mut new_data = CachedSystemData::default();

                // CPU data
                if let Ok(cpu_data) = query_cpu(&wmi_con) {
                    new_data.cpu_name = cpu_data.0;
                    new_data.cpu_usage = cpu_data.1;
                    new_data.cpu_clock_mhz = cpu_data.2;
                }

                // GPU data (WMI fallback)
                if let Ok(gpu_data) = query_gpu(&wmi_con) {
                    new_data.gpu_name = gpu_data.0;
                    new_data.gpu_vendor = gpu_data.1;
                    new_data.gpu_vram_mb = gpu_data.2;
                }

                // GPU usage (generic): try WMI perf counters first, then PDH.
                if let Ok(usage) = query_gpu_usage_percent(&wmi_con) {
                    new_data.gpu_usage_percent = usage;
                } else if let Some(usage) = pdh::gpu_usage_percent() {
                    new_data.gpu_usage_percent = usage;
                }

                // NVIDIA GPU data via NVML
                if let Some(ref device) = nvidia_device {
                    new_data.nvidia_gpu = query_nvidia_gpu(device);
                    // Override name with NVML data if available
                    if new_data.nvidia_gpu.available && !new_data.nvidia_gpu.name.is_empty() {
                        new_data.gpu_name = new_data.nvidia_gpu.name.clone();
                        new_data.gpu_vendor = "NVIDIA".to_string();
                        new_data.gpu_usage_percent = new_data.nvidia_gpu.usage_percent as f32;
                        new_data.gpu_vram_used_mb = new_data.nvidia_gpu.memory_used_mb;
                        new_data.gpu_vram_mb = new_data.nvidia_gpu.memory_total_mb;
                    }
                }

                // CPU usage fallback: if WMI didn't provide it, try PDH.
                if new_data.cpu_usage <= 0.0 {
                    if let Some(cpu_usage) = pdh::cpu_total_usage_percent() {
                        new_data.cpu_usage = cpu_usage;
                    }
                }

                // RAM speed
                if let Ok(speed) = query_ram_speed(&wmi_con) {
                    new_data.ram_speed_mhz = speed;
                }

                // Storage
                if let Ok(drives) = query_storage(&wmi_con) {
                    new_data.drives = drives;
                }

                // Network - get previous data for speed calculation
                let prev_network = { cache.lock().map(|c| c.network.clone()).unwrap_or_default() };
                if let Ok(net) = query_network(&wmi_con, &prev_network) {
                    new_data.network = net;
                }

                new_data.last_updated = Some(Instant::now());

                // Update cache
                if let Ok(mut cache_guard) = cache.lock() {
                    *cache_guard = new_data;
                }

                // Sleep for 2 seconds before next update
                thread::sleep(Duration::from_secs(2));
            }
        });
    }

    pub fn get_cached_data(&self) -> CachedSystemData {
        self.cache
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn is_ready(&self) -> bool {
        self.cache
            .lock()
            .map(|guard| guard.last_updated.is_some())
            .unwrap_or(false)
    }
}

fn query_cpu(wmi_con: &WMIConnection) -> Result<(String, f32, u32), String> {
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, LoadPercentage, CurrentClockSpeed FROM Win32_Processor")
        .map_err(|e| e.to_string())?;

    if let Some(cpu) = results.first() {
        let name = match cpu.get("Name") {
            Some(Variant::String(s)) => s.clone(),
            _ => "Unknown CPU".to_string(),
        };

        let usage = match cpu.get("LoadPercentage") {
            Some(Variant::UI2(v)) => *v as f32,
            Some(Variant::UI4(v)) => *v as f32,
            _ => 0.0,
        };

        let clock_mhz = match cpu.get("CurrentClockSpeed") {
            Some(Variant::UI4(v)) => *v,
            _ => 0,
        };

        Ok((name, usage, clock_mhz))
    } else {
        Err("No CPU data".to_string())
    }
}

fn query_gpu(wmi_con: &WMIConnection) -> Result<(String, String, u64), String> {
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, AdapterRAM FROM Win32_VideoController")
        .map_err(|e| e.to_string())?;

    if let Some(gpu) = results.first() {
        let name = match gpu.get("Name") {
            Some(Variant::String(s)) => s.clone(),
            _ => "Unknown GPU".to_string(),
        };

        let vram = match gpu.get("AdapterRAM") {
            Some(Variant::UI4(v)) => (*v as u64) / 1024 / 1024,
            _ => 0,
        };

        let vendor = if name.to_lowercase().contains("nvidia") {
            "NVIDIA"
        } else if name.to_lowercase().contains("amd") || name.to_lowercase().contains("radeon") {
            "AMD"
        } else if name.to_lowercase().contains("intel") {
            "Intel"
        } else {
            "Unknown"
        }
        .to_string();

        Ok((name, vendor, vram))
    } else {
        Err("No GPU data".to_string())
    }
}

/// Query overall GPU usage percent via WMI performance counters.
///
/// Works on Windows 10/11 when GPU performance counters are available.
/// Falls back to PDH elsewhere.
fn query_gpu_usage_percent(wmi_con: &WMIConnection) -> Result<f32, String> {
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query(
            "SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
        )
        .map_err(|e| e.to_string())?;

    if results.is_empty() {
        return Err("No GPU engine perf data".to_string());
    }

    // Similar to Task Manager, a reasonable overall metric is the max engine utilization.
    let mut max_value: f32 = 0.0;

    for row in results.iter() {
        let _name = match row.get("Name") {
            Some(Variant::String(s)) => s,
            _ => continue,
        };

        let value_f: f32 = match row.get("UtilizationPercentage") {
            Some(Variant::String(s)) => s.parse::<f32>().unwrap_or(0.0),
            Some(Variant::UI8(v)) => *v as f32,
            Some(Variant::UI4(v)) => *v as f32,
            Some(Variant::UI2(v)) => *v as f32,
            Some(Variant::I8(v)) => *v as f32,
            Some(Variant::I4(v)) => *v as f32,
            Some(Variant::I2(v)) => *v as f32,
            _ => 0.0,
        };

        if value_f > max_value {
            max_value = value_f;
        }
    }

    Ok(max_value.clamp(0.0, 100.0))
}

fn query_ram_speed(wmi_con: &WMIConnection) -> Result<u32, String> {
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Speed FROM Win32_PhysicalMemory")
        .map_err(|e| e.to_string())?;

    if let Some(mem) = results.first() {
        match mem.get("Speed") {
            Some(Variant::UI4(v)) => Ok(*v),
            _ => Err("Speed not found".to_string()),
        }
    } else {
        Err("No memory data".to_string())
    }
}

fn query_storage(wmi_con: &WMIConnection) -> Result<Vec<CachedDriveInfo>, String> {
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType=3")
        .map_err(|e| e.to_string())?;

    let drives = results
        .iter()
        .filter_map(|disk| {
            let letter = match disk.get("DeviceID") {
                Some(Variant::String(s)) => s.clone(),
                _ => return None,
            };

            let label = match disk.get("VolumeName") {
                Some(Variant::String(s)) => s.clone(),
                Some(Variant::Null) => String::new(),
                _ => String::new(),
            };

            let file_system = match disk.get("FileSystem") {
                Some(Variant::String(s)) => s.clone(),
                _ => "Unknown".to_string(),
            };

            let total_bytes: u64 = match disk.get("Size") {
                Some(Variant::String(s)) => s.parse().unwrap_or(0),
                Some(Variant::UI8(n)) => *n as u64,
                Some(Variant::I8(n)) => *n as u64,
                Some(Variant::UI4(n)) => *n as u64,
                Some(Variant::I4(n)) => *n as u64,
                Some(Variant::UI2(n)) => *n as u64,
                Some(Variant::I2(n)) => *n as u64,
                _ => 0,
            };

            let free_bytes: u64 = match disk.get("FreeSpace") {
                Some(Variant::String(s)) => s.parse().unwrap_or(0),
                Some(Variant::UI8(n)) => *n as u64,
                Some(Variant::I8(n)) => *n as u64,
                Some(Variant::UI4(n)) => *n as u64,
                Some(Variant::I4(n)) => *n as u64,
                Some(Variant::UI2(n)) => *n as u64,
                Some(Variant::I2(n)) => *n as u64,
                _ => 0,
            };

            Some(CachedDriveInfo {
                letter,
                label,
                file_system,
                total_bytes,
                free_bytes,
            })
        })
        .collect();

    Ok(drives)
}

/// Query NVIDIA GPU data via NVML
fn query_nvidia_gpu(device: &nvml_wrapper::Device) -> NvidiaGpuData {
    let mut data = NvidiaGpuData::default();

    // Get device name
    if let Ok(name) = device.name() {
        data.name = name;
    }

    // Get temperature
    if let Ok(temp) =
        device.temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
    {
        data.temperature_c = temp;
    }

    // Get GPU utilization
    if let Ok(util) = device.utilization_rates() {
        data.usage_percent = util.gpu;
    }

    // Get memory info
    if let Ok(mem) = device.memory_info() {
        data.memory_used_mb = mem.used / 1024 / 1024;
        data.memory_total_mb = mem.total / 1024 / 1024;
    }

    // Get power draw (in milliwatts, convert to watts)
    if let Ok(power) = device.power_usage() {
        data.power_draw_w = power / 1000;
    }

    // Get fan speed
    if let Ok(fan) = device.fan_speed(0) {
        data.fan_speed_percent = fan;
    }

    data.available = true;
    data
}

/// Query network interface data via WMI
fn query_network(
    wmi_con: &WMIConnection,
    prev: &CachedNetworkData,
) -> Result<CachedNetworkData, String> {
    // Query active network adapters with real traffic
    let results: Vec<HashMap<String, Variant>> = wmi_con
        .raw_query("SELECT Name, BytesReceivedPersec, BytesSentPersec, BytesTotalPersec FROM Win32_PerfFormattedData_Tcpip_NetworkInterface")
        .map_err(|e| e.to_string())?;

    // Find the most active interface (highest total bytes)
    let mut best_interface: Option<CachedNetworkData> = None;
    let mut max_traffic: u64 = 0;

    for iface in results.iter() {
        let name = match iface.get("Name") {
            Some(Variant::String(s)) => s.clone(),
            _ => continue,
        };

        // Skip virtual/loopback adapters
        if name.to_lowercase().contains("loopback")
            || name.to_lowercase().contains("virtual")
            || name.to_lowercase().contains("vmware")
            || name.to_lowercase().contains("vethernet")
        {
            continue;
        }

        let received: u64 = match iface.get("BytesReceivedPersec") {
            Some(Variant::String(s)) => s.parse().unwrap_or(0),
            Some(Variant::UI8(n)) => *n,
            Some(Variant::UI4(n)) => *n as u64,
            _ => 0,
        };

        let sent: u64 = match iface.get("BytesSentPersec") {
            Some(Variant::String(s)) => s.parse().unwrap_or(0),
            Some(Variant::UI8(n)) => *n,
            Some(Variant::UI4(n)) => *n as u64,
            _ => 0,
        };

        let total: u64 = match iface.get("BytesTotalPersec") {
            Some(Variant::String(s)) => s.parse().unwrap_or(0),
            Some(Variant::UI8(n)) => *n,
            Some(Variant::UI4(n)) => *n as u64,
            _ => received + sent,
        };

        // Prefer interface with most traffic, or keep the existing one by name
        let is_better = if !prev.interface_name.is_empty() && name == prev.interface_name {
            true // Keep same interface for consistency
        } else {
            total > max_traffic || best_interface.is_none()
        };

        if is_better {
            max_traffic = total;
            best_interface = Some(CachedNetworkData {
                interface_name: name,
                download_bytes_sec: received,
                upload_bytes_sec: sent,
                total_received: prev.total_received + received * 2, // Approximate cumulative
                total_sent: prev.total_sent + sent * 2,
                is_connected: received > 0 || sent > 0,
            });
        }
    }

    best_interface.ok_or_else(|| "No network interface found".to_string())
}
