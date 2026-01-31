import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState, type MouseEvent, type WheelEvent } from 'react'
import { AudioData } from '../../types'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'
import { VolumeIcon } from '../icons'

interface AudioWidgetProps {
    isLoading?: boolean
}

export function AudioWidget({ isLoading }: AudioWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    const [audioData, setAudioData] = useState<AudioData | null>(null)
    
    // Fetch audio data periodically
    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await invoke<AudioData>('get_audio_data')
                setAudioData(data)
            } catch (err) {
                console.error('Failed to fetch audio data:', err)
            }
        }
        
        fetchData()
        const interval = setInterval(fetchData, 2000)
        return () => clearInterval(interval)
    }, [])
    
    const volume = audioData?.master_volume ?? 100
    const isMuted = audioData?.is_muted ?? false

    const handleClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.audio.width, POPUP_SIZES.audio.height)

        window.requestAnimationFrame(() => {
            void invoke('open_audio_popup', { x, y }).catch((err) => {
                console.error('Failed to open audio popup:', err)
            })
        })
    }
    
    const handleWheel = async (e: WheelEvent) => {
        e.preventDefault()
        
        // deltaY negative = scroll up = increase volume
        // deltaY positive = scroll down = decrease volume
        const delta = e.deltaY < 0 ? 5 : -5
        
        try {
            await invoke('adjust_master_volume', { delta })
            // Refresh data after adjustment
            const data = await invoke<AudioData>('get_audio_data')
            setAudioData(data)
        } catch (err) {
            console.error('Failed to adjust volume:', err)
        }
    }
    
    const handleMiddleClick = async (e: MouseEvent) => {
        // Middle click to toggle mute
        if (e.button === 1) {
            e.preventDefault()
            try {
                await invoke('toggle_mute')
                const data = await invoke<AudioData>('get_audio_data')
                setAudioData(data)
            } catch (err) {
                console.error('Failed to toggle mute:', err)
            }
        }
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--audio widget--icon-only ${isLoading ? 'widget--loading' : ''} ${isMuted ? 'widget--muted' : ''}`}
            onClick={handleClick}
            onWheel={handleWheel}
            onMouseDown={handleMiddleClick}
            style={{ cursor: 'pointer' }}
            title={`Volume: ${volume}%${isMuted ? ' (Mudo)' : ''}\nScroll para ajustar`}
        >
            <div className="widget__icon widget__icon--volume">
                <VolumeIcon muted={isMuted} level={volume} />
            </div>
            {!isMuted && (
                <div className="widget__volume-level">
                    <span>{volume}</span>
                </div>
            )}
        </div>
    )
}
