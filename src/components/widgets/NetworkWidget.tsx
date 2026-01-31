import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { NetworkData } from '../../types'
import { NetworkIcon, ArrowDownIcon, ArrowUpIcon } from '../icons'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

interface NetworkWidgetProps {
    data?: NetworkData
    isLoading?: boolean
}

// Format bytes per second to megabits per second (Mbps) - like ISPs advertise
function formatSpeedMbps(bytesPerSec: number): string {
    const bitsPerSec = bytesPerSec * 8
    if (bitsPerSec < 1000) {
        return `${bitsPerSec.toFixed(0)} bps`
    } else if (bitsPerSec < 1000 * 1000) {
        return `${(bitsPerSec / 1000).toFixed(1)} Kbps`
    } else if (bitsPerSec < 1000 * 1000 * 1000) {
        return `${(bitsPerSec / 1000 / 1000).toFixed(1)} Mbps`
    } else {
        return `${(bitsPerSec / 1000 / 1000 / 1000).toFixed(2)} Gbps`
    }
}

// Compact format for display (Mbps)
function formatSpeedCompact(bytesPerSec: number): string {
    const bitsPerSec = bytesPerSec * 8
    if (bitsPerSec < 1000) {
        return `${bitsPerSec.toFixed(0)}b`
    } else if (bitsPerSec < 1000 * 1000) {
        return `${(bitsPerSec / 1000).toFixed(0)}K`
    } else if (bitsPerSec < 1000 * 1000 * 1000) {
        return `${(bitsPerSec / 1000 / 1000).toFixed(1)}M`
    } else {
        return `${(bitsPerSec / 1000 / 1000 / 1000).toFixed(1)}G`
    }
}

export function NetworkWidget({ data, isLoading }: NetworkWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    
    const downloadSpeed = data?.download_bytes_sec ?? 0
    const uploadSpeed = data?.upload_bytes_sec ?? 0
    const isConnected = data?.is_connected ?? false

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.network.width, POPUP_SIZES.network.height)

        window.requestAnimationFrame(() => {
            void invoke('open_network_popup', { x, y }).catch((err) => {
                console.error('Failed to open Network popup:', err)
            })
        })
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--network widget--inline ${isLoading ? 'widget--loading' : ''} ${!isConnected ? 'widget--disconnected' : ''}`}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                <NetworkIcon />
            </div>
            <div className="widget__content widget__content--network">
                <span className="widget__network-speed widget__network-speed--down" title={formatSpeedMbps(downloadSpeed)}>
                    <span className="widget__network-arrow"><ArrowDownIcon /></span>
                    {formatSpeedCompact(downloadSpeed)}
                </span>
                <span className="widget__network-speed widget__network-speed--up" title={formatSpeedMbps(uploadSpeed)}>
                    <span className="widget__network-arrow"><ArrowUpIcon /></span>
                    {formatSpeedCompact(uploadSpeed)}
                </span>
            </div>
        </div>
    )
}
