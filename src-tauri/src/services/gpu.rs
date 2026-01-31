//! GPU monitoring service with generic (WMI/DXGI) and NVIDIA-specific telemetry

use crate::services::wmi_service::CachedSystemData;
use serde::Serialize;

/// Basic GPU data available for all vendors
#[derive(Serialize, Clone, Debug)]
pub struct GpuBasicData {
    /// GPU name/model
    pub name: String,
    /// GPU vendor (NVIDIA, AMD, Intel, Unknown)
    pub vendor: String,
    /// GPU usage percentage (0-100)
    pub usage_percent: f32,
    /// VRAM used in MB
    pub vram_used_mb: u64,
    /// Total VRAM in MB
    pub vram_total_mb: u64,
    /// VRAM usage percentage
    pub vram_usage_percent: f32,
}

/// Detailed GPU data (NVIDIA-specific via NVAPI)
#[derive(Serialize, Clone, Debug)]
pub struct GpuDetailedData {
    #[serde(flatten)]
    pub basic: GpuBasicData,
    /// GPU temperature in Celsius
    pub temperature_c: Option<f32>,
    /// GPU power draw in Watts
    pub power_draw_w: Option<f32>,
    /// GPU power limit in Watts
    pub power_limit_w: Option<f32>,
    /// Core clock speed in MHz
    pub core_clock_mhz: Option<u32>,
    /// Memory clock speed in MHz
    pub memory_clock_mhz: Option<u32>,
    /// Fan speed in RPM
    pub fan_speed_rpm: Option<u32>,
    /// Fan speed percentage
    pub fan_speed_percent: Option<f32>,
    /// GPU voltage in mV
    pub voltage_mv: Option<u32>,
    /// PCIe generation
    pub pcie_gen: Option<u8>,
    /// PCIe lane count
    pub pcie_lanes: Option<u8>,
    /// Performance state (P0-P12)
    pub perf_state: Option<String>,
}

/// Unified GPU data enum
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum GpuData {
    Basic(GpuBasicData),
    Detailed(GpuDetailedData),
}

impl Default for GpuBasicData {
    fn default() -> Self {
        Self {
            name: "Unknown GPU".to_string(),
            vendor: "Unknown".to_string(),
            usage_percent: 0.0,
            vram_used_mb: 0,
            vram_total_mb: 0,
            vram_usage_percent: 0.0,
        }
    }
}

/// Get GPU information using cached WMI data + NVIDIA data
pub fn get_gpu_info_cached(cached: &CachedSystemData) -> GpuData {
    // If NVIDIA GPU is available, return detailed data
    if cached.nvidia_gpu.available {
        let nvidia = &cached.nvidia_gpu;

        let vram_usage_percent = if nvidia.memory_total_mb > 0 {
            (nvidia.memory_used_mb as f32 / nvidia.memory_total_mb as f32) * 100.0
        } else {
            0.0
        };

        let basic = GpuBasicData {
            name: nvidia.name.clone(),
            vendor: "NVIDIA".to_string(),
            usage_percent: nvidia.usage_percent as f32,
            vram_used_mb: nvidia.memory_used_mb,
            vram_total_mb: nvidia.memory_total_mb,
            vram_usage_percent,
        };

        let detailed = GpuDetailedData {
            basic,
            temperature_c: Some(nvidia.temperature_c as f32),
            power_draw_w: Some(nvidia.power_draw_w as f32),
            power_limit_w: None,
            core_clock_mhz: None,
            memory_clock_mhz: None,
            fan_speed_rpm: None,
            fan_speed_percent: Some(nvidia.fan_speed_percent as f32),
            voltage_mv: None,
            pcie_gen: None,
            pcie_lanes: None,
            perf_state: None,
        };

        return GpuData::Detailed(detailed);
    }

    // Fallback to WMI data
    let mut basic = GpuBasicData::default();

    if !cached.gpu_name.is_empty() {
        basic.name = cached.gpu_name.clone();
    } else {
        basic.name = "Loading...".to_string();
    }

    basic.vendor = cached.gpu_vendor.clone();
    basic.usage_percent = cached.gpu_usage_percent;
    basic.vram_total_mb = cached.gpu_vram_mb;
    basic.vram_used_mb = cached.gpu_vram_used_mb;

    if basic.vram_total_mb > 0 {
        basic.vram_usage_percent = (basic.vram_used_mb as f32 / basic.vram_total_mb as f32) * 100.0;
    }

    GpuData::Basic(basic)
}

/// Legacy sync function - returns defaults quickly
pub fn get_gpu_info() -> Result<GpuData, String> {
    Ok(GpuData::Basic(GpuBasicData::default()))
}
