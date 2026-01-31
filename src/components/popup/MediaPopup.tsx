import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import '../../index.css'
import { MediaData } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../icons'

export function MediaPopup() {
    const [data, setData] = useState<MediaData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isDragging, setIsDragging] = useState(false)
    const [dragPosition, setDragPosition] = useState(0)
    // Interpolated position for smooth timeline
    const [displayPosition, setDisplayPosition] = useState(0)
    const progressRef = useRef<HTMLDivElement>(null)
    const { isExiting } = usePopupExit()
    
    // Store a baseline position and a monotonic timestamp for smooth UI animation.
    // The Rust backend returns a stable, interpolated position_seconds.
    // We animate locally with requestAnimationFrame for 60fps smoothness.
    const lastUpdateRef = useRef({ position: 0, timestampMs: performance.now(), isPlaying: false, duration: 0 })
    const rafRef = useRef<number | null>(null)

    // Fetch media data from backend (less frequent now that backend is event-driven)
    useEffect(() => {
        const fetchData = async () => {
            try {
                const mediaData = await invoke<MediaData>('get_media_data')
                setData(mediaData)
                
                const isPlaying = mediaData.status === 'Playing'
                lastUpdateRef.current = {
                    position: mediaData.position_seconds,
                    timestampMs: performance.now(),
                    isPlaying,
                    duration: mediaData.duration_seconds,
                }

                // Update display immediately on fetch
                setDisplayPosition(mediaData.position_seconds)
            } catch (err) {
                console.error('Failed to fetch media data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        // Poll every 1s to match backend refresh rate
        const interval = setInterval(fetchData, 1000)
        return () => clearInterval(interval)
    }, [])

    // Interpolate position smoothly with requestAnimationFrame (60fps)
    useEffect(() => {
        if (isDragging) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
            return
        }

        const animate = () => {
            const ref = lastUpdateRef.current
            
            if (ref.isPlaying) {
                const elapsedSeconds = (performance.now() - ref.timestampMs) / 1000
                let estimated = ref.position + elapsedSeconds
                
                // Clamp to duration
                if (ref.duration > 0 && estimated > ref.duration) {
                    estimated = ref.duration
                }
                
                setDisplayPosition(estimated)
            }
            
            rafRef.current = requestAnimationFrame(animate)
        }

        rafRef.current = requestAnimationFrame(animate)
        
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [isDragging])

    const handlePlayPause = async () => {
        try {
            await invoke('media_play_pause')
        } catch (err) {
            console.error('Failed to toggle play/pause:', err)
        }
    }

    const handlePrevious = async () => {
        try {
            await invoke('media_previous')
        } catch (err) {
            console.error('Failed to go to previous:', err)
        }
    }

    const handleNext = async () => {
        try {
            await invoke('media_next')
        } catch (err) {
            console.error('Failed to go to next:', err)
        }
    }

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleProgressClick = async (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || !data || isDragging) return
        const rect = progressRef.current.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        const newPosition = percent * data.duration_seconds
        
        try {
            await invoke('media_seek', { positionSeconds: newPosition })
            // Update interpolation reference immediately for responsive UI
            lastUpdateRef.current = { 
                position: newPosition, 
                timestampMs: performance.now(),
                isPlaying: data ? data.status === 'Playing' : lastUpdateRef.current.isPlaying,
                duration: data?.duration_seconds ?? lastUpdateRef.current.duration,
            }
            setDisplayPosition(newPosition)
        } catch (err) {
            console.error('Failed to seek:', err)
        }
    }

    // Calculate position from mouse event
    const getPositionFromEvent = useCallback((clientX: number): number => {
        if (!progressRef.current || !data) return 0
        const rect = progressRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        return percent * data.duration_seconds
    }, [data])

    // Drag handlers
    const handleThumbMouseDown = useCallback((e: ReactMouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!data) return
        
        setIsDragging(true)
        setDragPosition(getPositionFromEvent(e.clientX))
    }, [data, getPositionFromEvent])

    useEffect(() => {
        if (!isDragging) return

        const handleMouseMove = (e: globalThis.MouseEvent) => {
            setDragPosition(getPositionFromEvent(e.clientX))
        }

        const handleMouseUp = async (e: globalThis.MouseEvent) => {
            const finalPosition = getPositionFromEvent(e.clientX)
            setIsDragging(false)
            
            try {
                await invoke('media_seek', { positionSeconds: finalPosition })
                // Update interpolation reference immediately for responsive UI
                lastUpdateRef.current = { 
                    position: finalPosition, 
                    timestampMs: performance.now(),
                    isPlaying: data ? data.status === 'Playing' : lastUpdateRef.current.isPlaying,
                    duration: data?.duration_seconds ?? lastUpdateRef.current.duration,
                }
                setDisplayPosition(finalPosition)
            } catch (err) {
                console.error('Failed to seek:', err)
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, getPositionFromEvent, data])

    const isPlaying = data?.status === 'Playing'
    // Use displayPosition (interpolated when playing, exact when paused)
    const currentPosition = isDragging ? dragPosition : displayPosition
    const progressPercent = data && data.duration_seconds > 0 
        ? (currentPosition / data.duration_seconds) * 100 
        : 0

    return (
        <div className={`popup-container popup-container--media${isExiting ? ' popup-container--exiting' : ''}`}>
            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : !data?.has_media ? (
                <div className="popup-empty">
                    <div className="media-popup__no-media">
                        <span className="media-popup__no-media-icon">🎵</span>
                        <span>Nenhuma mídia em reprodução</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* Cover with thumbnail */}
                    <div className="media-popup__cover">
                        {data.thumbnail_base64 && (
                            <img 
                                className="media-popup__thumbnail"
                                src={`data:image/png;base64,${data.thumbnail_base64}`}
                                alt="Album art"
                            />
                        )}
                    </div>

                    {/* Content */}
                    <div className="media-popup__content">
                        {/* Title & Artist */}
                        <div className="media-popup__info">
                            <span className="media-popup__title">{data.title || 'Sem título'}</span>
                            {data.artist && (
                                <span className="media-popup__artist">{data.artist}</span>
                            )}
                            {data.album && (
                                <span className="media-popup__album">{data.album}</span>
                            )}
                            <span className="media-popup__source">{data.source_app}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="media-popup__progress-container">
                            <span className="media-popup__time">{formatTime(currentPosition)}</span>
                            <div 
                                ref={progressRef}
                                className={`media-popup__progress-bar${isDragging ? ' media-popup__progress-bar--dragging' : ''}`}
                                onClick={handleProgressClick}
                            >
                                <div 
                                    className="media-popup__progress-fill"
                                    style={{ width: `${progressPercent}%` }}
                                />
                                <div 
                                    className="media-popup__progress-thumb"
                                    style={{ left: `${progressPercent}%` }}
                                    onMouseDown={handleThumbMouseDown}
                                />
                            </div>
                            <span className="media-popup__time">{formatTime(data.duration_seconds)}</span>
                        </div>

                        {/* Controls */}
                        <div className="media-popup__controls">
                            <button 
                                className="media-popup__btn" 
                                onClick={handlePrevious}
                                title="Anterior"
                            >
                                <PreviousIcon />
                            </button>
                            <button 
                                className="media-popup__btn media-popup__btn--play" 
                                onClick={handlePlayPause}
                                title={isPlaying ? 'Pausar' : 'Reproduzir'}
                            >
                                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                            </button>
                            <button 
                                className="media-popup__btn" 
                                onClick={handleNext}
                                title="Próximo"
                            >
                                <NextIcon />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default MediaPopup
