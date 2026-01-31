/* eslint-disable react-refresh/only-export-components */
// Polished icon set (Lucide) + a few custom dynamic SVGs

import {
    Activity,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Bolt,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Clock,
    Cloud,
    CloudDrizzle,
    CloudFog,
    CloudLightning,
    CloudRain,
    CloudSun,
    Cpu,
    Download,
    Fan,
    FileText,
    Folder,
    FolderOpen,
    HardDrive,
    Hexagon,
    Image,
    LayoutGrid,
    Lightbulb,
    Lock,
    LogOut,
    MapPin,
    MemoryStick,
    Menu,
    Mic,
    MicOff,
    Monitor,
    Moon,
    Music,
    Network,
    Pause,
    Pipette,
    Play,
    Power,
    RefreshCw,
    Settings,
    SkipBack,
    SkipForward,
    Snowflake,
    Sun,
    Thermometer,
    Video,
    X,
    type LucideProps,
} from 'lucide-react'
import type { ElementType } from 'react'

type IconProps = Omit<LucideProps, 'ref'>

function L(Icon: ElementType<IconProps>, props?: IconProps) {
    return <Icon strokeWidth={2} {...props} />
}

export function CpuIcon() {
    return L(Cpu)
}

export function RamIcon() {
    return L(MemoryStick)
}

export function GpuIcon() {
    // Lucide doesn't ship a dedicated GPU icon; Monitor reads well at small sizes.
    return L(Monitor)
}

export function StorageIcon() {
    return L(HardDrive)
}

export function ClockIcon() {
    return L(Clock)
}

export function SettingsIcon() {
    return L(Settings)
}

export function PowerIcon() {
    return L(Power)
}

export function LockIcon() {
    return L(Lock)
}

export function SignOutIcon() {
    return L(LogOut)
}

export function TaskManagerIcon() {
    return L(Activity)
}

export function NotificationsIcon({ hasUnread = false }: { hasUnread?: boolean }) {
    // Keep as custom SVG to support the unread badge.
    return (
        <svg
            className={hasUnread ? 'notifications-icon notifications-icon--unread' : 'notifications-icon'}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            {hasUnread ? (
                <circle
                    className="notifications-icon__badge"
                    cx="18"
                    cy="6"
                    r="3.2"
                    fill="var(--accent-red)"
                    stroke="var(--bar-bg)"
                    strokeWidth="2"
                />
            ) : null}
        </svg>
    )
}

export function PipetteIcon() {
    return L(Pipette)
}

export function FanIcon() {
    return L(Fan)
}

export function NetworkIcon() {
    return L(Network)
}

export function TemperatureIcon() {
    return L(Thermometer)
}

export function LayoutGridIcon(props?: IconProps) {
    return L(LayoutGrid, props)
}

export function CloseIcon() {
    return L(X)
}

export function CheckIcon() {
    return L(Check)
}

export function ChevronUpIcon() {
    return L(ChevronUp)
}

export function ChevronDownIcon() {
    return L(ChevronDown)
}

export function VolumeIcon({ muted = false, level = 100 }: { muted?: boolean; level?: number }) {
    const variant: 'muted' | 'low' | 'high' = muted || level === 0 ? 'muted' : level < 50 ? 'low' : 'high'

    // Custom Windows-like speaker: solid glyph with simple waves.
    // Uses currentColor so CSS controls the color.
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Speaker body */}
            <path
                d="M4 10.25c0-.69.56-1.25 1.25-1.25H8.2l4.55-3.2c.83-.59 1.98 0 1.98 1.02v11.36c0 1.02-1.15 1.61-1.98 1.02L8.2 17H5.25C4.56 17 4 16.44 4 15.75v-5.5Z"
                fill="currentColor"
            />

            {/* Waves */}
            {variant !== 'muted' ? (
                <path
                    d={
                        variant === 'low'
                            ? 'M16.75 10.2c.95.95.95 2.65 0 3.6'
                            : 'M16.6 8.55c1.75 1.75 1.75 5.15 0 6.9M19.1 6.95c2.6 2.6 2.6 7.5 0 10.1'
                    }
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            ) : null}

            {/* Muted X */}
            {variant === 'muted' ? (
                <path
                    d="M17.2 10.2l3.6 3.6m0-3.6-3.6 3.6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ) : null}
        </svg>
    )
}

export function MicIcon({ muted = false }: { muted?: boolean }) {
    if (muted) {
        return L(MicOff)
    }
    return L(Mic)
}

export function HeadsetIcon({ status = 'connected', batteryLevel = 100 }: { status?: 'connected' | 'disconnected' | 'charging'; batteryLevel?: number }) {
    // Battery indicator color based on level
    const getBatteryColor = () => {
        if (status === 'charging') return '#4ade80' // green for charging
        if (batteryLevel <= 20) return '#ef4444' // red for low
        if (batteryLevel <= 50) return '#f59e0b' // orange for medium
        return 'currentColor'
    }

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Headband */}
            <path d="M4 12V9a8 8 0 0 1 16 0v3" />
            {/* Left ear cup */}
            <rect x="2" y="11" width="4" height="7" rx="1" fill={status === 'disconnected' ? 'none' : getBatteryColor()} />
            {/* Right ear cup */}
            <rect x="18" y="11" width="4" height="7" rx="1" fill={status === 'disconnected' ? 'none' : getBatteryColor()} />
            {/* Mic boom */}
            <path d="M6 15h-1a1 1 0 0 0-1 1v2" />
            {/* Charging indicator */}
            {status === 'charging' && (
                <path d="M11 14l2-3v2h2l-2 3v-2h-2" stroke="#4ade80" strokeWidth="2" fill="none" />
            )}
            {/* Disconnected X */}
            {status === 'disconnected' && (
                <>
                    <line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" strokeWidth="2" />
                    <line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" strokeWidth="2" />
                </>
            )}
        </svg>
    )
}

export function BatteryIcon({ level = 100, charging = false }: { level?: number; charging?: boolean }) {
    const fillWidth = Math.max(0, Math.min(100, level)) / 100 * 14
    
    const getColor = () => {
        if (charging) return '#4ade80'
        if (level <= 20) return '#ef4444'
        if (level <= 50) return '#f59e0b'
        return 'currentColor'
    }

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Battery body */}
            <rect x="2" y="7" width="18" height="10" rx="2" />
            {/* Battery cap */}
            <path d="M20 10h2v4h-2" />
            {/* Fill level */}
            <rect x="4" y="9" width={fillWidth} height="6" rx="1" fill={getColor()} stroke="none" />
            {/* Charging bolt */}
            {charging && (
                <path d="M11 8l-2 4h4l-2 4" stroke="#4ade80" strokeWidth="2" fill="none" />
            )}
        </svg>
    )
}

// Media player icons
export function PlayIcon() {
    return L(Play)
}

export function PauseIcon() {
    return L(Pause)
}

export function PreviousIcon() {
    return L(SkipBack)
}

export function NextIcon() {
    return L(SkipForward)
}

// Weather icons
export function SunIcon() {
    return L(Sun)
}

export function MoonIcon() {
    return L(Moon)
}

export function CloudIcon() {
    return L(Cloud)
}

export function CloudSunIcon() {
    return L(CloudSun)
}

export function CloudRainIcon() {
    return L(CloudRain)
}

export function CloudDrizzleIcon() {
    return L(CloudDrizzle)
}

export function CloudLightningIcon() {
    return L(CloudLightning)
}

export function SnowflakeIcon() {
    return L(Snowflake)
}

export function FogIcon() {
    return L(CloudFog)
}

export function ThermometerIcon() {
    return L(Thermometer)
}

// UI icons
export function LocationIcon() {
    return L(MapPin)
}

export function RefreshIcon() {
    return L(RefreshCw)
}

export function LightbulbIcon() {
    return L(Lightbulb)
}

export function ChevronRightIcon() {
    return L(ChevronRight)
}

export function HexagonIcon() {
    return L(Hexagon)
}

export function WarningIcon() {
    return L(AlertTriangle)
}

export function ArrowDownIcon() {
    return L(ArrowDown)
}

export function ArrowUpIcon() {
    return L(ArrowUp)
}

export function BoltIcon() {
    return L(Bolt)
}

// Menu (hamburger) icon
export function MenuIcon() {
    return L(Menu)
}

// Folder icons
export function FolderIcon() {
    return L(Folder)
}

export function FolderOpenIcon() {
    return L(FolderOpen)
}

export function DownloadIcon() {
    return L(Download)
}

export function FileTextIcon() {
    return L(FileText)
}

export function ImageIcon() {
    return L(Image)
}

export function MusicIcon() {
    return L(Music)
}

export function VideoIcon() {
    return L(Video)
}

// Map icon name string to component
export function getFolderIconByName(iconName: string) {
    switch (iconName) {
        case 'download':
            return <DownloadIcon />
        case 'file-text':
            return <FileTextIcon />
        case 'image':
            return <ImageIcon />
        case 'music':
            return <MusicIcon />
        case 'video':
            return <VideoIcon />
        case 'folder-open':
            return <FolderOpenIcon />
        default:
            return <FolderIcon />
    }
}
