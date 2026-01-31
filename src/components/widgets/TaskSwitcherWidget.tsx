import { useEffect, useState, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

interface WindowInfo {
    hwnd: number
    title: string
    process_name: string
    process_path: string
    is_minimized: boolean
}

// Cache for process icons
const iconCache = new Map<string, string | null>()

export function TaskSwitcherWidget() {
    const [currentWindow, setCurrentWindow] = useState<WindowInfo | null>(null)
    const [icon, setIcon] = useState<string | null>(null)
    const [shouldShow, setShouldShow] = useState(false)
    const widgetRef = useRef<HTMLDivElement>(null)
    const hideTimeoutRef = useRef<number | null>(null)
    const lastWindowRef = useRef<boolean>(false)

    // Fetch current foreground window
    useEffect(() => {
        const fetchCurrentWindow = async () => {
            try {
                const win = await invoke<WindowInfo | null>('get_foreground_window')
                
                if (win) {
                    // Clear any pending hide timeout
                    if (hideTimeoutRef.current) {
                        clearTimeout(hideTimeoutRef.current)
                        hideTimeoutRef.current = null
                    }
                    
                    setCurrentWindow(win)
                    setShouldShow(true)
                    lastWindowRef.current = true
                    
                    // Fetch icon if not cached
                    if (win.process_path && !iconCache.has(win.process_path)) {
                        try {
                            const iconData = await invoke<string | null>('get_process_icon', { processPath: win.process_path })
                            iconCache.set(win.process_path, iconData)
                            setIcon(iconData)
                        } catch {
                            iconCache.set(win.process_path, null)
                            setIcon(null)
                        }
                    } else {
                        setIcon(iconCache.get(win.process_path) ?? null)
                    }
                } else if (lastWindowRef.current) {
                    // Window just lost - start hide timeout
                    lastWindowRef.current = false
                    if (!hideTimeoutRef.current) {
                        hideTimeoutRef.current = window.setTimeout(() => {
                            setShouldShow(false)
                            setCurrentWindow(null)
                            hideTimeoutRef.current = null
                        }, 2000) // 2 seconds before hiding
                    }
                }
            } catch (err) {
                console.error('Failed to fetch foreground window:', err)
            }
        }

        fetchCurrentWindow()
        const interval = setInterval(fetchCurrentWindow, 500)
        return () => {
            clearInterval(interval)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [])

    const handleClick = useCallback(async () => {
        if (!widgetRef.current) return
        const rect = widgetRef.current.getBoundingClientRect()
        const size = POPUP_SIZES.taskswitcher
        const pos = calculatePopupPosition(rect, size.width, size.height)
        
        try {
            await invoke('open_taskswitcher_popup', { x: pos.x, y: pos.y })
        } catch (err) {
            console.error('Failed to open task switcher popup:', err)
        }
    }, [])

    // Don't render if nothing to show
    if (!shouldShow || !currentWindow) {
        return null
    }

    const displayTitle = currentWindow.title

    return (
        <div
            ref={widgetRef}
            className="widget widget--taskswitcher widget--inline"
            onClick={handleClick}
            title={`${currentWindow.title}\n(Clique para alternar janelas)`}
        >
            <div className="widget__icon taskswitcher-widget__icon">
                {icon ? (
                    <img src={icon} alt="" className="taskswitcher-widget__img" />
                ) : (
                    <div className="taskswitcher-widget__fallback">
                        {currentWindow.process_name.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>
            <div className="widget__content">
                <div className="taskswitcher-widget__marquee">
                    <span className="taskswitcher-widget__title">
                        {displayTitle}
                    </span>
                </div>
            </div>
        </div>
    )
}
