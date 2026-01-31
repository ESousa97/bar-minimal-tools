import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { SystemSnapshot, AppConfig, NetworkData } from '../types'
import { CpuWidget } from './widgets/CpuWidget'
import { RamWidget } from './widgets/RamWidget'
import { GpuWidget } from './widgets/GpuWidget'
import { StorageWidget } from './widgets/StorageWidget'
import { NetworkWidget } from './widgets/NetworkWidget'
import { AudioWidget } from './widgets/AudioWidget'
import { HeadsetWidget } from './widgets/HeadsetWidget'
import { MediaWidget } from './widgets/MediaWidget'
import { WeatherWidget } from './widgets/WeatherWidget'
import { ClockWidget } from './widgets/ClockWidget'
import { NotesWidget } from './widgets/NotesWidget'
import { TaskSwitcherWidget } from './widgets/TaskSwitcherWidget'
import { NotificationsIcon, SettingsIcon, PowerIcon, MenuIcon, PipetteIcon } from './icons'
import { AnimatedWidgetSlot } from './AnimatedWidgetSlot'
import { getWidgetSection } from '../utils/widgets'
import { calculatePopupPosition, POPUP_SIZES } from '../utils/popupPosition'

interface TaskbarProps {
    systemData: SystemSnapshot | null
    config: AppConfig | null
}

export function Taskbar({ systemData, config }: TaskbarProps) {
    const [networkData, setNetworkData] = useState<NetworkData | null>(null)
    const [unreadNotificationCount, setUnreadNotificationCount] = useState<number | null>(null)
    const [lastSeenNotificationCount, setLastSeenNotificationCount] = useState(0)
    const powerButtonRef = useRef<HTMLButtonElement>(null)
    const menuButtonRef = useRef<HTMLButtonElement>(null)
    const devPickerButtonRef = useRef<HTMLButtonElement>(null)
    const [devPickedColor, setDevPickedColor] = useState<string>(() => {
        try {
            return window.localStorage.getItem('dev:colorPicker:last') || '#22d3ee'
        } catch {
            return '#22d3ee'
        }
    })

    useEffect(() => {
        try {
            window.localStorage.setItem('dev:colorPicker:last', devPickedColor)
        } catch {
            // ignore
        }

        document.documentElement.style.setProperty('--dev-picked-color', devPickedColor)
    }, [devPickedColor])

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== 'dev:colorPicker:last') return
            if (typeof e.newValue !== 'string' || !e.newValue) return
            setDevPickedColor(e.newValue)
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    // Fetch network data separately (updated every 2 seconds like other system data)
    useEffect(() => {
        const fetchNetwork = async () => {
            try {
                const data = await invoke<NetworkData>('get_network_data')
                setNetworkData(data)
            } catch (err) {
                console.error('Failed to fetch network data:', err)
            }
        }
        
        fetchNetwork()
        const interval = setInterval(fetchNetwork, 2000)
        return () => clearInterval(interval)
    }, [])

    // Best-effort unread notifications indicator.
    // If the Windows API is unavailable or permission isn't granted, we keep it neutral.
    useEffect(() => {
        const fetchUnread = async () => {
            try {
                const count = await invoke<number | null>('get_unread_notification_count')
                if (typeof count === 'number') {
                    setUnreadNotificationCount(count)
                } else {
                    setUnreadNotificationCount(null)
                }
            } catch {
                setUnreadNotificationCount(null)
            }
        }

        fetchUnread()
        const interval = setInterval(fetchUnread, 5000)
        return () => clearInterval(interval)
    }, [])

    const hasUnreadNotifications =
        typeof unreadNotificationCount === 'number' && unreadNotificationCount > lastSeenNotificationCount

    const widgets = config?.widgets
        .slice()
        .sort((a, b) => a.order - b.order) || []

    const leftWidgets = widgets.filter(w => getWidgetSection(w.type) === 'left')
    const rightWidgets = widgets.filter(w => getWidgetSection(w.type) === 'right')

    const isLoading = !systemData

    const openFoldersPopup = () => {
        // Position menu at left edge of viewport (monitor), directly below taskbar
        const x = window.screenX // Left edge of current monitor
        const taskbarRect = menuButtonRef.current?.closest('.taskbar')?.getBoundingClientRect()
        const y = window.screenY + (taskbarRect?.bottom ?? 32)
        invoke('open_folders_popup', { x: Math.round(x), y: Math.round(y) }).catch(console.warn)
    }

    const getTooltip = (type: string): string => {
        switch (type) {
            case 'cpu':
                if (!systemData?.cpu) return 'CPU'
                return `${systemData.cpu.name}\n${systemData.cpu.logical_cores} cores`
            case 'ram':
                if (!systemData?.ram) return 'RAM'
                return `RAM: ${(systemData.ram.used_bytes / (1024 ** 3)).toFixed(1)}GB / ${(systemData.ram.total_bytes / (1024 ** 3)).toFixed(1)}GB`
            case 'gpu':
                if (!systemData?.gpu) return 'GPU'
                return `${systemData.gpu.name}`
            case 'network':
                return networkData?.interface_name || 'Network'
            default:
                return ''
        }
    }

    return (
        <>
            <div className="taskbar">
                {/* Menu Button - Far left */}
                <button
                    ref={menuButtonRef}
                    className="menu-btn"
                    title="Acesso Rápido"
                    onPointerDown={(e) => {
                        // Use pointerdown to avoid the Windows click-through "mouseup" reopening the menu.
                        if (e.button !== 0) return
                        e.preventDefault()
                        openFoldersPopup()
                    }}
                    onKeyDown={(e) => {
                        // Keep keyboard accessibility without relying on click (which can be duplicated).
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        openFoldersPopup()
                    }}
                >
                    <MenuIcon />
                </button>

                {/* Left Section - Widgets */}
                <div className="taskbar__section taskbar__section--left">
                    {leftWidgets.map(widget => {
                        switch (widget.type) {
                            case 'cpu':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper" title={getTooltip('cpu')}>
                                            <CpuWidget data={systemData?.cpu} isLoading={isLoading} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'ram':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper" title={getTooltip('ram')}>
                                            <RamWidget data={systemData?.ram} isLoading={isLoading} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'gpu':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper" title={getTooltip('gpu')}>
                                            <GpuWidget data={systemData?.gpu} isLoading={isLoading} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'storage':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <StorageWidget isLoading={isLoading} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'network':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper" title={getTooltip('network')}>
                                            <NetworkWidget data={networkData || undefined} isLoading={!networkData} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'media':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <MediaWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'taskswitcher':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <TaskSwitcherWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            default:
                                return null
                        }
                    })}
                </div>

                {/* Center Section - Empty now */}
                <div className="taskbar__section taskbar__section--center">
                </div>

                {/* Right Section - Audio, Headset, Weather, Clock & Settings */}
                <div className="taskbar__section taskbar__section--right">
                    {rightWidgets.map(widget => {
                        switch (widget.type) {
                            case 'notes':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <NotesWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'audio':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <AudioWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'headset':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <HeadsetWidget alwaysShow={true} />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'weather':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <WeatherWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            case 'clock':
                                return (
                                    <AnimatedWidgetSlot key={widget.id} enabled={widget.enabled}>
                                        <div className="widget-wrapper">
                                            <ClockWidget />
                                        </div>
                                    </AnimatedWidgetSlot>
                                )
                            default:
                                return null
                        }
                    })}

                    <button
                        ref={devPickerButtonRef}
                        className="settings-btn settings-btn--dev-color"
                        title={`Conta-gotas\nÚltima cor: ${devPickedColor}`}
                        onClick={() => {
                            if (!devPickerButtonRef.current) return
                            const rect = devPickerButtonRef.current.getBoundingClientRect()
                            const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.devColor.width, POPUP_SIZES.devColor.height)
                            window.requestAnimationFrame(() => {
                                void invoke('open_dev_color_popup', { x, y }).catch((err) => {
                                    console.warn('Failed to open dev color popup:', err)
                                })
                            })
                        }}
                    >
                        <span className="dev-color-icon" aria-hidden="true">
                            <PipetteIcon />
                            <span className="dev-color-icon__swatch" aria-hidden="true" />
                        </span>
                    </button>

                    <button
                        className="settings-btn settings-btn--notifications"
                        title="Notificações"
                        onClick={() => {
                            // Consider notifications as "seen" once the user opens the center.
                            if (typeof unreadNotificationCount === 'number') {
                                setLastSeenNotificationCount(unreadNotificationCount)
                            }
                            window.requestAnimationFrame(() => {
                                void invoke('open_notification_center').catch((err) => {
                                    console.warn('Failed to open notification center:', err)
                                })
                            })
                        }}
                    >
                        <NotificationsIcon hasUnread={hasUnreadNotifications} />
                    </button>

                    <button
                        className="settings-btn settings-btn--settings"
                        title="Configurações"
                        onClick={() => {
                            const taskbarHeight = config?.display.barHeight || 36
                            window.requestAnimationFrame(() => {
                                void invoke('open_settings_popup', { taskbarHeight }).catch(() => {})
                            })
                        }}
                    >
                        <SettingsIcon />
                    </button>

                    <button
                        ref={powerButtonRef}
                        className="settings-btn settings-btn--power"
                        title="Energia"
                        onClick={() => {
                            if (!powerButtonRef.current) return
                            const rect = powerButtonRef.current.getBoundingClientRect()
                            const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.power.width, POPUP_SIZES.power.height)
                            window.requestAnimationFrame(() => {
                                void invoke('open_power_popup', { x, y }).catch((err) => {
                                    console.warn('Failed to open power popup:', err)
                                })
                            })
                        }}
                    >
                        <PowerIcon />
                    </button>
                </div>
            </div>
        </>
    )
}
