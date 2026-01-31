import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { MediaData } from '../../types'
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../icons'

interface MediaWidgetProps {
    alwaysShow?: boolean
}

export function MediaWidget({ alwaysShow = false }: MediaWidgetProps) {
    const [data, setData] = useState<MediaData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [shouldShow, setShouldShow] = useState(false)
    const widgetRef = useRef<HTMLDivElement>(null)
    const hideTimeoutRef = useRef<number | null>(null)
    const lastMediaRef = useRef<boolean>(false)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const mediaData = await invoke<MediaData>('get_media_data')
                setData(mediaData)
                
                // Handle show/hide logic with 2 min delay
                if (mediaData.has_media) {
                    // Clear any pending hide timeout
                    if (hideTimeoutRef.current) {
                        clearTimeout(hideTimeoutRef.current)
                        hideTimeoutRef.current = null
                    }
                    setShouldShow(true)
                    lastMediaRef.current = true
                } else if (lastMediaRef.current && !mediaData.has_media) {
                    // Media just stopped - start 2 min timer
                    lastMediaRef.current = false
                    if (!hideTimeoutRef.current) {
                        hideTimeoutRef.current = window.setTimeout(() => {
                            setShouldShow(false)
                            hideTimeoutRef.current = null
                        }, 2 * 60 * 1000) // 2 minutes
                    }
                }
            } catch (err) {
                console.error('Failed to fetch media data:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 1000)
        return () => {
            clearInterval(interval)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [])

    const handlePlayPause = async (e: MouseEvent) => {
        e.stopPropagation()
        try {
            await invoke('media_play_pause')
        } catch (err) {
            console.error('Failed to toggle play/pause:', err)
        }
    }

    const handlePrevious = async (e: MouseEvent) => {
        e.stopPropagation()
        try {
            await invoke('media_previous')
        } catch (err) {
            console.error('Failed to go to previous:', err)
        }
    }

    const handleNext = async (e: MouseEvent) => {
        e.stopPropagation()
        try {
            await invoke('media_next')
        } catch (err) {
            console.error('Failed to go to next:', err)
        }
    }

    const handleWidgetClick = () => {
        if (!widgetRef.current) return

        const rect = widgetRef.current.getBoundingClientRect()
        const popupWidth = 300
        const x = Math.round(rect.left + rect.width / 2 - popupWidth / 2)
        const y = Math.round(rect.bottom + 4)

        window.requestAnimationFrame(() => {
            void invoke('open_media_popup', { x, y }).catch((err) => {
                console.error('Failed to open media popup:', err)
            })
        })
    }

    const isPlaying = data?.status === 'Playing'
    const hasMedia = data?.has_media
    const hasThumbnail = !!data?.thumbnail_base64

    // Hide widget based on shouldShow state (with 2 min delay)
    if (!alwaysShow && !shouldShow && !isLoading) {
        return null
    }

    // Still loading
    if (isLoading) {
        return null
    }

    // Check if title needs marquee animation (if it's long)
    const title = data?.title || ''
    const needsMarquee = title.length > 20

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--media ${!hasMedia ? 'widget--media-idle' : ''} ${hasThumbnail ? 'widget--media-has-thumb' : ''}`}
            title={data?.title ? `${data.title}${data.artist ? ` - ${data.artist}` : ''}` : 'Sem mídia'}
            onClick={handleWidgetClick}
            style={hasThumbnail ? ({
                '--media-thumb': `url(data:image/jpeg;base64,${data?.thumbnail_base64})`
            } as CSSProperties) : undefined}
        >
            {/* Background thumbnail */}
            {hasThumbnail && (
                <div className="media-widget__thumb-bg" />
            )}
            
            {/* Title marquee in background */}
            {hasMedia && title && (
                <div className={`media-widget__title-bg ${needsMarquee ? 'media-widget__title-bg--marquee' : ''}`}>
                    <span className="media-widget__title-text">{title}</span>
                    {needsMarquee && <span className="media-widget__title-text">{title}</span>}
                </div>
            )}

            {/* Hover overlay for contrast */}
            <div className="media-widget__overlay" />

            {/* Controls - hidden by default, visible on hover */}
            <div className="media-widget__controls">
                <button 
                    className="media-widget__btn" 
                    onClick={handlePrevious}
                    title="Anterior"
                >
                    <PreviousIcon />
                </button>
                <button 
                    className="media-widget__btn media-widget__btn--play" 
                    onClick={handlePlayPause}
                    title={isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button 
                    className="media-widget__btn" 
                    onClick={handleNext}
                    title="Próximo"
                >
                    <NextIcon />
                </button>
            </div>
        </div>
    )
}

export default MediaWidget
