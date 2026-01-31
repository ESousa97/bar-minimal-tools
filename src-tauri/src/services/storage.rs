//! Storage monitoring service for HDD, SSD, and NVMe drives

use serde::Serialize;
use crate::services::wmi_service::CachedSystemData;

#[derive(Serialize, Clone, Debug)]
pub struct DriveInfo {
    /// Drive letter (e.g., "C:")
    pub letter: String,
    /// Drive label/name
    pub label: String,
    /// Drive type (Fixed, Removable, Network, etc.)
    pub drive_type: String,
    /// File system (NTFS, FAT32, etc.)
    pub file_system: String,
    /// Total capacity in bytes
    pub total_bytes: u64,
    /// Free space in bytes
    pub free_bytes: u64,
    /// Used space in bytes
    pub used_bytes: u64,
    /// Usage percentage
    pub usage_percent: f32,
    /// Drive temperature in Celsius (if available via S.M.A.R.T.)
    pub temperature_c: Option<f32>,
    /// Drive health status
    pub health_status: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct StorageData {
    /// List of all drives
    pub drives: Vec<DriveInfo>,
    /// Total storage across all drives
    pub total_bytes: u64,
    /// Total free space across all drives
    pub free_bytes: u64,
}

impl Default for StorageData {
    fn default() -> Self {
        Self {
            drives: vec![],
            total_bytes: 0,
            free_bytes: 0,
        }
    }
}

/// Get storage information using cached WMI data
pub fn get_storage_info_cached(cached: &CachedSystemData) -> StorageData {
    let mut data = StorageData::default();
    
    for drive in &cached.drives {
        let used_bytes = drive.total_bytes.saturating_sub(drive.free_bytes);
        let usage_percent = if drive.total_bytes > 0 {
            (used_bytes as f32 / drive.total_bytes as f32) * 100.0
        } else {
            0.0
        };
        
        data.total_bytes += drive.total_bytes;
        data.free_bytes += drive.free_bytes;
        
        data.drives.push(DriveInfo {
            letter: drive.letter.clone(),
            label: drive.label.clone(),
            drive_type: "Fixed".to_string(),
            file_system: drive.file_system.clone(),
            total_bytes: drive.total_bytes,
            free_bytes: drive.free_bytes,
            used_bytes,
            usage_percent,
            temperature_c: None,
            health_status: None,
        });
    }
    
    data
}

/// Legacy sync function - returns empty defaults
pub fn get_storage_info() -> Result<StorageData, String> {
    Ok(StorageData::default())
}
