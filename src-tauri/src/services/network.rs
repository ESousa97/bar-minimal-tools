//! Network monitoring service

use serde::Serialize;
use crate::services::wmi_service::CachedNetworkData;

#[derive(Serialize, Clone, Debug)]
pub struct NetworkData {
    /// Network interface name
    pub interface_name: String,
    /// Download speed in bytes per second
    pub download_bytes_sec: u64,
    /// Upload speed in bytes per second
    pub upload_bytes_sec: u64,
    /// Total bytes received
    pub total_received: u64,
    /// Total bytes sent
    pub total_sent: u64,
    /// Is connected
    pub is_connected: bool,
}

impl Default for NetworkData {
    fn default() -> Self {
        Self {
            interface_name: "Unknown".to_string(),
            download_bytes_sec: 0,
            upload_bytes_sec: 0,
            total_received: 0,
            total_sent: 0,
            is_connected: false,
        }
    }
}

/// Get network information using cached data
pub fn get_network_info_cached(cached: &CachedNetworkData) -> NetworkData {
    NetworkData {
        interface_name: cached.interface_name.clone(),
        download_bytes_sec: cached.download_bytes_sec,
        upload_bytes_sec: cached.upload_bytes_sec,
        total_received: cached.total_received,
        total_sent: cached.total_sent,
        is_connected: cached.is_connected,
    }
}
