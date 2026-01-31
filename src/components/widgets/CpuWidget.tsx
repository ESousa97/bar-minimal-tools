import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { CpuData } from '../../types'
import { CpuIcon } from '../icons'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

interface CpuWidgetProps {
    data?: CpuData
    isLoading?: boolean
}

export function CpuWidget({ data, isLoading }: CpuWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    
    const usage = data?.total_usage ?? 0
    const usageFormatted = usage.toFixed(0)
    const temperature = data?.temperature_c ?? null
    
    // Temperature badge (only if available)
    const tempDisplay = temperature !== null && temperature > 0 ? `${temperature.toFixed(0)}°` : null

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.cpu.width, POPUP_SIZES.cpu.height)

        window.requestAnimationFrame(() => {
            void invoke('open_cpu_popup', { x, y }).catch((err) => {
                console.error('Failed to open CPU popup:', err)
            })
        })
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--cpu widget--inline ${isLoading ? 'widget--loading' : ''}`}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                <CpuIcon />
            </div>
            <div className="widget__content">
                <span className="widget__value">{usageFormatted}%</span>
                {tempDisplay && (
                    <span className="widget__cpu-temp">{tempDisplay}</span>
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
