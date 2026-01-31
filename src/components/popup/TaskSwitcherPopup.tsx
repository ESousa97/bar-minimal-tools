import { useEffect, useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { usePopupExit } from '../../utils/usePopupExit'
import { LayoutGrid, Minimize2 } from 'lucide-react'
import '../../index.css'

interface WindowInfo {
    hwnd: number
    title: string
    process_name: string
    process_path: string
    is_minimized: boolean
}

interface WindowList {
    windows: WindowInfo[]
}

// Cache for process icons
const iconCache = new Map<string, string | null>()

export function TaskSwitcherPopup() {
    const [windows, setWindows] = useState<WindowInfo[]>([])
    const [icons, setIcons] = useState<Map<string, string | null>>(new Map())
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const { isExiting } = usePopupExit()
    const inputRef = useRef<HTMLInputElement>(null)

    // Fetch window list
    useEffect(() => {
        const fetchWindows = async () => {
            try {
                const data = await invoke<WindowList>('get_window_list')
                setWindows(data.windows)
                
                // Fetch icons for new processes
                const uniquePaths = [...new Set(data.windows.map(w => w.process_path).filter(p => p))]
                for (const path of uniquePaths) {
                    if (!iconCache.has(path)) {
                        try {
                            const icon = await invoke<string | null>('get_process_icon', { processPath: path })
                            iconCache.set(path, icon)
                            setIcons(new Map(iconCache))
                        } catch {
                            iconCache.set(path, null)
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to fetch windows:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchWindows()
        const interval = setInterval(fetchWindows, 1000)
        return () => clearInterval(interval)
    }, [])

    const handleWindowClick = useCallback(async (hwnd: number) => {
        try {
            await invoke('focus_window', { hwnd })
        } catch (err) {
            console.error('Failed to focus window:', err)
        }
    }, [])

    // Filter windows by search term
    const filteredWindows = windows.filter(win => {
        if (!searchTerm) return true
        const term = searchTerm.toLowerCase()
        return (
            win.title.toLowerCase().includes(term) ||
            win.process_name.toLowerCase().includes(term)
        )
    })

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => Math.min(prev + 1, filteredWindows.length - 1))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter' && filteredWindows[selectedIndex]) {
                e.preventDefault()
                handleWindowClick(filteredWindows[selectedIndex].hwnd)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [filteredWindows, selectedIndex, handleWindowClick])

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [searchTerm])

    return (
        <div className={`popup-container popup-container--taskswitcher${isExiting ? ' popup-container--exiting' : ''}`}>
            {/* Header */}
            <div className="popup-header">
                <div className="popup-title">
                    <LayoutGrid size={14} />
                    <span>Janelas Abertas</span>
                    <span className="taskswitcher-popup__count">{windows.length}</span>
                </div>
            </div>

            {/* Search */}
            <div className="taskswitcher-popup__search">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Buscar janela..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="taskswitcher-popup__search-input"
                    autoFocus
                />
            </div>

            {/* Window list */}
            <div className="popup-content taskswitcher-popup__list">
                {loading ? (
                    <div className="popup-loading">Carregando...</div>
                ) : filteredWindows.length === 0 ? (
                    <div className="popup-empty">
                        {searchTerm ? 'Nenhuma janela encontrada' : 'Nenhuma janela aberta'}
                    </div>
                ) : (
                    filteredWindows.map((win, index) => {
                        const icon = icons.get(win.process_path) ?? null
                        const isSelected = index === selectedIndex
                        
                        return (
                            <button
                                key={win.hwnd}
                                onClick={() => handleWindowClick(win.hwnd)}
                                className={`taskswitcher-popup__item${isSelected ? ' taskswitcher-popup__item--selected' : ''}`}
                            >
                                <div className="taskswitcher-popup__item-icon">
                                    {icon ? (
                                        <img src={icon} alt="" />
                                    ) : (
                                        <div className="taskswitcher-popup__item-icon-fallback">
                                            {win.process_name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="taskswitcher-popup__item-info">
                                    <span className="taskswitcher-popup__item-title" title={win.title}>
                                        {win.title || 'Sem título'}
                                    </span>
                                    <span className="taskswitcher-popup__item-process">
                                        {win.process_name}
                                        {win.is_minimized && (
                                            <span className="taskswitcher-popup__item-minimized">
                                                <Minimize2 size={10} />
                                                Minimizada
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </button>
                        )
                    })
                )}
            </div>

            {/* Footer */}
            <div className="taskswitcher-popup__footer">
                <span>↑↓ Navegar</span>
                <span>Enter Focar</span>
            </div>
        </div>
    )
}

export default TaskSwitcherPopup
