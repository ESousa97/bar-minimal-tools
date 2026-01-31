import { invoke } from '@tauri-apps/api/core'
import { useRef } from 'react'
import { GpuData } from '../../types'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'
import { GpuIcon } from '../icons'

interface GpuWidgetProps {
    data?: GpuData
    isLoading?: boolean
}

export function GpuWidget({ data, isLoading }: GpuWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    
    // Extract data - check if detailed (NVIDIA) or basic
    const detailed = data?.type === 'Detailed' ? data : null
    const usage = data?.usage_percent ?? 0
    const temperature = detailed?.temperature_c ?? null
    const powerDraw = detailed?.power_draw_w ?? null

    // Always display usage percentage
    const displayValue = `${usage.toFixed(0)}%`
    
    // Temperature badge (only for NVIDIA)
    const tempDisplay = temperature !== null && temperature > 0 ? `${temperature.toFixed(0)}°` : null
    
    // Power draw badge (only for NVIDIA)
    const powerDisplay = powerDraw !== null && powerDraw > 0 ? `${powerDraw.toFixed(0)}W` : null

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.gpu.width, POPUP_SIZES.gpu.height)

        window.requestAnimationFrame(() => {
            void invoke('open_gpu_popup', { x, y }).catch((err) => {
                console.error('Failed to open GPU popup:', err)
            })
        })
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--gpu widget--inline ${isLoading ? 'widget--loading' : ''}`}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                <GpuIcon />
            </div>
            <div className="widget__content">
                <span className="widget__value">{displayValue}</span>
                {tempDisplay && (
                    <span className="widget__temp">{tempDisplay}</span>
                )}
                {powerDisplay && (
                    <span className="widget__power">{powerDisplay}</span>
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
