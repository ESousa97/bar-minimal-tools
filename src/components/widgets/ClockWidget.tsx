import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

export function ClockWidget() {
    const [time, setTime] = useState(new Date())
    const widgetRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date())
        }, 1000)

        return () => clearInterval(timer)
    }, [])

    const timeString = time.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    })

    const dateString = time.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { width, height } = POPUP_SIZES.calendar
        const { x, y } = calculatePopupPosition(rect, width, height)

        window.requestAnimationFrame(() => {
            void invoke('open_calendar_popup', { x, y }).catch((err) => {
                console.error('Failed to open calendar popup:', err)
            })
        })
    }

    return (
        <div 
            ref={widgetRef}
            className="widget widget--clock widget--clock-inline"
            onClick={handleClick}
        >
            <span className="clock-time">{timeString}</span>
            <span className="clock-separator">•</span>
            <span className="clock-date">{dateString}</span>
        </div>
    )
}
