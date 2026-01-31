// System data types matching Rust backend

export interface CpuData {
    name: string
    total_usage: number
    per_core_usage: number[]
    logical_cores: number
    physical_cores: number
    temperature_c: number | null
    power_draw_w: number | null
    voltage_mv: number | null
    clock_mhz: number | null
}

export interface RamData {
    total_bytes: number
    available_bytes: number
    used_bytes: number
    usage_percent: number
    voltage_mv: number | null
    temperature_c: number | null
    speed_mhz: number | null
}

export interface GpuBasicData {
    name: string
    vendor: string
    usage_percent: number
    vram_used_mb: number
    vram_total_mb: number
    vram_usage_percent: number
}

export interface GpuDetailedData extends GpuBasicData {
    temperature_c: number | null
    power_draw_w: number | null
    power_limit_w: number | null
    core_clock_mhz: number | null
    memory_clock_mhz: number | null
    fan_speed_rpm: number | null
    fan_speed_percent: number | null
    voltage_mv: number | null
    pcie_gen: number | null
    pcie_lanes: number | null
    perf_state: string | null
}

export type GpuData =
    | { type: 'Basic' } & GpuBasicData
    | { type: 'Detailed' } & GpuDetailedData

export interface DriveInfo {
    letter: string
    label: string
    drive_type: string
    file_system: string
    total_bytes: number
    free_bytes: number
    used_bytes: number
    usage_percent: number
    temperature_c: number | null
    health_status: string | null
}

export interface StorageData {
    drives: DriveInfo[]
    total_bytes: number
    free_bytes: number
}

export interface NetworkData {
    interface_name: string
    download_bytes_sec: number
    upload_bytes_sec: number
    total_received: number
    total_sent: number
    is_connected: boolean
}

export interface AudioDevice {
    id: string
    name: string
    is_default: boolean
    volume: number
    is_muted: boolean
    device_type: 'output' | 'input'
}

export interface AudioData {
    output_devices: AudioDevice[]
    input_devices: AudioDevice[]
    default_output_id: string | null
    default_input_id: string | null
    master_volume: number
    is_muted: boolean
}

export type HeadsetStatus = 'Connected' | 'Disconnected' | 'Charging' | 'Unknown'

export type EqualizerPreset = 1 | 2 | 3 | 4 | 5

export const EqualizerPresetNames: Record<EqualizerPreset, string> = {
    1: 'Pure',
    2: 'Bass Boost',
    3: 'Movie',
    4: 'FPS Competition',
    5: 'Custom',
}

export interface HeadsetFeatures {
    has_battery: boolean
    has_mic_toggle: boolean
    has_surround_sound: boolean
    has_sidetone: boolean
    has_equalizer: boolean
    has_lighting: boolean
}

export interface HeadsetData {
    name: string
    device_id: string
    battery_percent: number
    status: HeadsetStatus
    is_charging: boolean
    sdk_available: boolean
    mic_enabled: boolean
    surround_sound_enabled: boolean
    sidetone_enabled: boolean
    equalizer_preset: EqualizerPreset
    led_count: number
    supported_features: HeadsetFeatures
}

export interface IcueSdkStatus {
    installed: boolean
    sdk_path: string | null
    icue_running: boolean
    error: string | null
    version: string | null
}

export interface SystemSnapshot {
    cpu: CpuData
    ram: RamData
    gpu: GpuData
    storage: StorageData
    timestamp: number
}

// Config types
export interface WidgetConfig {
    id: string
    type: string
    enabled: boolean
    order: number
}

export interface DisplayConfig {
    targetMonitor: string
    barHeight: number
    theme: 'dark' | 'light'
    opacity: number
    blur: boolean
}

export interface PollingConfig {
    intervalMs: number
    detailedIntervalMs: number
}

export interface AppConfig {
    profileName: string
    createdAt: string
    modifiedAt: string
    display: DisplayConfig
    widgets: WidgetConfig[]
    polling: PollingConfig
}

// Monitor types
export interface MonitorInfo {
    id: string
    name: string
    is_primary: boolean
    width: number
    height: number
    x: number
    y: number
    scale_factor: number
}

export interface ProfileSummary {
    filename: string
    name: string
    is_active: boolean
    modified_at: string
}

// Media types
export type PlaybackStatus = 'Playing' | 'Paused' | 'Stopped' | 'Unknown'

export interface MediaData {
    has_media: boolean
    title: string
    artist: string
    album: string
    source_app: string
    status: PlaybackStatus
    thumbnail_base64: string | null
    position_seconds: number
    duration_seconds: number
}

// Notes
export interface Note {
    id: string
    title: string
    content: string
    updated_at: string
}

// Weather types
export interface WeatherData {
    loaded: boolean
    city: string
    country: string
    temperature: number
    feels_like: number
    temp_min: number
    temp_max: number
    humidity: number
    pressure: number
    description: string
    icon: string
    wind_speed: number
    wind_deg: number
    clouds: number
    visibility: number
    sunrise: number
    sunset: number
}

export interface WeatherConfig {
    enabled: boolean
    useAutoLocation: boolean
    latitude: number
    longitude: number
    cityName: string
}

// Folder shortcuts
export interface FolderShortcut {
    id: string
    name: string
    path: string
    icon: string
    enabled: boolean
}

export interface FolderShortcutsConfig {
    shortcuts: FolderShortcut[]
}

export interface LocationData {
    latitude: number
    longitude: number
    city: string
    region: string
    country: string
    success: boolean
}
