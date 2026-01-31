import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RamData } from '../../types'
import { RamIcon } from '../icons'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

interface RamWidgetProps {
    data?: RamData
    isLoading?: boolean
}

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)}G`
}

export function RamWidget({ data, isLoading }: RamWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    
    const usage = data?.usage_percent ?? 0
    const usedGB = data?.used_bytes ? formatBytes(data.used_bytes) : '0G'
    const totalGB = data?.total_bytes ? formatBytes(data.total_bytes) : '0G'
    const speedMhz = data?.speed_mhz ?? null
    
    // Format percentage display
    const percentDisplay = `${usage.toFixed(0)}%`
    
    // Format memory display (used/total)
    const memoryDisplay = `${usedGB}/${totalGB}`
    
    // Format speed display
    const speedDisplay = speedMhz && speedMhz > 0 ? `${speedMhz}` : null

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.ram.width, POPUP_SIZES.ram.height)

        window.requestAnimationFrame(() => {
            void invoke('open_ram_popup', { x, y }).catch((err) => {
                console.error('Failed to open RAM popup:', err)
            })
        })
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--ram widget--inline ${isLoading ? 'widget--loading' : ''}`}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                <RamIcon />
            </div>
            <div className="widget__content">
                <span className="widget__value">{percentDisplay}</span>
                <span className="widget__mem">{memoryDisplay}</span>
                {speedDisplay && (
                    <span className="widget__speed">{speedDisplay}</span>
                )}
            </div>
            <div className="widget__progress">
                <div
                    className="widget__progress-bar"
                    style={{ width: `${Math.min(100, usage)}%` }}
                />
            </div>
        </div>
    )
}
