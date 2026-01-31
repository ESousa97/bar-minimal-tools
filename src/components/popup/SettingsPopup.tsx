import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../../index.css'
import { AppConfig, FolderShortcut, FolderShortcutsConfig, MonitorInfo, WidgetConfig } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'
import { normalizeConfig } from '../../utils/widgets'
import { CloseIcon } from '../icons'
import { AboutSection, MonitorCard } from '../shared/SettingsShared'
import { AppearanceTab, ShortcutsTab, SystemTab, WidgetsTab } from './settings'

type TabId = 'appearance' | 'widgets' | 'shortcuts' | 'monitor' | 'system' | 'about'

export function SettingsPopup() {
    const [activeTab, setActiveTab] = useState<TabId>('appearance')
    const [monitors, setMonitors] = useState<MonitorInfo[]>([])
    const [config, setConfig] = useState<AppConfig | null>(null)
    const [loadedConfig, setLoadedConfig] = useState<AppConfig | null>(null)
    const [saving, setSaving] = useState(false)
    const [autostartEnabled, setAutostartEnabled] = useState(false)
    const [showFactoryResetConfirm, setShowFactoryResetConfirm] = useState(false)
    const [factoryResetting, setFactoryResetting] = useState(false)
    const [factoryResetError, setFactoryResetError] = useState<string | null>(null)
    const [folderShortcuts, setFolderShortcuts] = useState<FolderShortcut[]>([])
    const [isAdmin, setIsAdmin] = useState(false)
    const savedRef = useRef(false)
    const closingRef = useRef(false)
    const heightPreviewTimerRef = useRef<number | null>(null)
    const { isExiting, triggerExit, resetExit } = usePopupExit({ autoCloseOnBlur: false })

    // Load config and monitors on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const profile = await invoke<AppConfig>('get_active_profile')
                const normalized = normalizeConfig(profile)
                setConfig(normalized)
                setLoadedConfig(normalized)
                const monitorList = await invoke<MonitorInfo[]>('list_monitors')
                setMonitors(monitorList)
                // Load folder shortcuts
                const foldersConfig = await invoke<FolderShortcutsConfig>('get_folder_shortcuts')
                setFolderShortcuts(foldersConfig.shortcuts)
                // Check autostart status.
                // On Windows we use a .bat file in the Startup folder.
                // Fallback to plugin-autostart if backend command isn't available.
                try {
                    const autostart = await invoke<boolean>('startup_is_enabled')
                    setAutostartEnabled(autostart)
                } catch {
                    const autostart = await isEnabled()
                    setAutostartEnabled(autostart)
                }
                // Check if running as administrator
                try {
                    const admin = await invoke<boolean>('is_running_as_admin')
                    setIsAdmin(admin)
                } catch {
                    setIsAdmin(false)
                }
            } catch (err) {
                console.error('Failed to load settings data:', err)
            }
        }
        loadData()
    }, [])

    const handleClose = async () => {
        if (closingRef.current) return
        closingRef.current = true

        // Trigger exit animation first
        await triggerExit()

        try {
            // Stop any pending debounced preview call.
            if (heightPreviewTimerRef.current) {
                window.clearTimeout(heightPreviewTimerRef.current)
                heightPreviewTimerRef.current = null
            }

            // If user was previewing bar height and closes without saving, revert.
            if (!savedRef.current && loadedConfig && config) {
                const originalHeight = loadedConfig.display.barHeight
                if (config.display.barHeight !== originalHeight) {
                    try {
                        await invoke('preview_taskbar_height', { barHeight: originalHeight, updateAppbar: true })
                    } catch (err) {
                        console.warn('Failed to revert bar height preview:', err)
                    }
                    try {
                        await emit('bar-height-preview-reset', { barHeight: originalHeight })
                    } catch (err) {
                        console.warn('Failed to emit bar height preview reset:', err)
                    }
                }

                const originalOpacity = loadedConfig.display.opacity
                if (config.display.opacity !== originalOpacity) {
                    try {
                        await emit('opacity-preview-reset', { opacity: originalOpacity })
                    } catch (err) {
                        console.warn('Failed to emit opacity preview reset:', err)
                    }
                }

                const originalBlur = loadedConfig.display.blur
                if (config.display.blur !== originalBlur) {
                    try {
                        await emit('blur-preview-reset', { blur: originalBlur })
                    } catch (err) {
                        console.warn('Failed to emit blur preview reset:', err)
                    }
                }
            }
            try {
                await getCurrentWindow().hide()
            } catch (hideErr) {
                // On some Windows setups, hide can fail intermittently for transparent windows.
                // Fallback to close() so the user isn't stuck with a window that "reopens".
                try {
                    await getCurrentWindow().close()
                } catch {
                    throw hideErr
                }
            }
        } catch (err) {
            console.error('Failed to close window:', err)
        } finally {
            // The window is hidden (not destroyed). Reset exit state so the next open
            // doesn't remain stuck in the "--exiting" CSS animation state.
            resetExit()
            closingRef.current = false
        }
    }

    if (!config) {
        return (
            <div className={`settings-popup${isExiting ? ' settings-popup--exiting' : ''}`}>
                <div className="settings-popup__backdrop" onClick={handleClose} />
                <div className="settings-popup__container">
                    <div className="settings-popup__loading">Carregando...</div>
                </div>
            </div>
        )
    }

    // Keep consistent with main window blur calculation.
    const baseBlurPx = Math.max(12, Math.min(48, Math.round(config.display.barHeight * 0.75)))
    const blurAmountPx = config.display.blur ? baseBlurPx : 0
    const baseRgb = config.display.theme === 'light' ? [245, 245, 250] : [15, 15, 20]
    const alpha = config.display.blur
        ? config.display.opacity
        : (config.display.opacity <= 0 ? 0 : Math.min(1, config.display.opacity + 0.05))
    const settingsStyles: CSSProperties = {
        ['--bar-height' as string]: `${config.display.barHeight}px`,
        ['--blur-amount' as string]: `${blurAmountPx}px`,
        ['--bar-bg' as string]: `rgba(${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}, ${alpha})`,
    }

    const updateDisplay = <K extends keyof AppConfig['display']>(
        key: K,
        value: AppConfig['display'][K]
    ) => {
        setConfig({
            ...config,
            display: { ...config.display, [key]: value }
        })

        // Live preview for barHeight
        if (key === 'barHeight') {
            const nextHeight = value as unknown as number
            // Update main UI immediately (CSS height)
            emit('bar-height-preview', { barHeight: nextHeight }).catch(() => { })

            // Debounce backend resizing to keep it smooth
            if (heightPreviewTimerRef.current) {
                window.clearTimeout(heightPreviewTimerRef.current)
            }
            heightPreviewTimerRef.current = window.setTimeout(() => {
                // While dragging, only resize the bar window; avoid updating AppBar work-area every tick.
                invoke('preview_taskbar_height', { barHeight: nextHeight, updateAppbar: false }).catch(() => { })
                heightPreviewTimerRef.current = null
            }, 50)
        }

        // Live preview for opacity (frontend only)
        if (key === 'opacity') {
            const nextOpacity = value as unknown as number
            emit('opacity-preview', { opacity: nextOpacity }).catch(() => { })
        }

        // Live preview for blur toggle (frontend only)
        if (key === 'blur') {
            const nextBlur = value as unknown as boolean
            emit('blur-preview', { blur: nextBlur }).catch(() => { })
        }
    }

    const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
        setConfig({
            ...config,
            widgets: config.widgets.map(w =>
                w.id === id ? { ...w, ...updates } : w
            )
        })
    }

    const moveWidget = (id: string, direction: 'up' | 'down') => {
        const widgets = [...config.widgets].sort((a, b) => a.order - b.order)
        const idx = widgets.findIndex(w => w.id === id)
        if (idx === -1) return

        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= widgets.length) return

        // Swap orders
        const temp = widgets[idx].order
        widgets[idx].order = widgets[newIdx].order
        widgets[newIdx].order = temp

        setConfig({ ...config, widgets })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await invoke('save_current_profile', { config })

            // Save folder shortcuts
            await invoke('save_folder_shortcuts', { shortcuts: { shortcuts: folderShortcuts } })

            // Only touch AppBar/monitor if those settings changed.
            if (
                loadedConfig &&
                (loadedConfig.display.targetMonitor !== config.display.targetMonitor ||
                    loadedConfig.display.barHeight !== config.display.barHeight)
            ) {
                await invoke('set_taskbar_monitor', {
                    monitorId: config.display.targetMonitor,
                    barHeight: config.display.barHeight,
                })
            }

            savedRef.current = true

            // Broadcast event to notify main window to reload config
            await emit('config-changed', config)
            handleClose()
        } catch (err) {
            console.error('Failed to save config:', err)
        } finally {
            setSaving(false)
        }
    }

    const updateFolderShortcut = (id: string, updates: Partial<FolderShortcut>) => {
        setFolderShortcuts(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    }

    const moveFolderShortcut = (id: string, direction: 'up' | 'down') => {
        const idx = folderShortcuts.findIndex(s => s.id === id)
        if (idx === -1) return

        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= folderShortcuts.length) return

        const newList = [...folderShortcuts]
        const temp = newList[idx]
        newList[idx] = newList[newIdx]
        newList[newIdx] = temp
        setFolderShortcuts(newList)
    }

    const removeFolderShortcut = (id: string) => {
        setFolderShortcuts(prev => prev.filter(s => s.id !== id))
    }

    const addFolderShortcut = () => {
        const newId = `folder-${Date.now()}`
        setFolderShortcuts(prev => [...prev, {
            id: newId,
            name: 'Nova Pasta',
            path: '',
            icon: 'folder',
            enabled: true,
        }])
    }

    const tabs: { id: TabId; label: string }[] = [
        { id: 'appearance', label: 'Aparência' },
        { id: 'widgets', label: 'Widgets' },
        { id: 'shortcuts', label: 'Atalhos' },
        { id: 'monitor', label: 'Monitor' },
        { id: 'system', label: 'Sistema' },
        { id: 'about', label: 'Sobre' },
    ]

    const handleAutostartToggle = async (enabled: boolean) => {
        try {
            // Prefer Windows scheduled task (runs elevated without UAC on logon).
            // Fallback to plugin-autostart if the backend command isn't supported.
            try {
                if (enabled) {
                    await invoke('startup_enable')
                } else {
                    await invoke('startup_disable')
                }
            } catch {
                if (enabled) {
                    await enable()
                } else {
                    await disable()
                }
            }
            setAutostartEnabled(enabled)
        } catch (err) {
            console.error('Failed to toggle autostart:', err)
        }
    }

    const handleFactoryReset = async () => {
        if (factoryResetting) return
        setFactoryResetting(true)
        setFactoryResetError(null)

        try {
            await invoke('factory_reset')

            // Reload fresh default config and broadcast to main window.
            const profile = await invoke<AppConfig>('get_active_profile')
            const normalized = normalizeConfig(profile)
            setConfig(normalized)
            setLoadedConfig(normalized)

            savedRef.current = true
            setShowFactoryResetConfirm(false)
            await emit('config-changed', normalized)

            // Close settings window after reset - use direct window API to avoid ref issues.
            try {
                await getCurrentWindow().hide()
            } catch {
                await getCurrentWindow().close()
            }
        } catch (err) {
            console.error('Failed to factory reset:', err)
            setFactoryResetError(typeof err === 'string' ? err : String(err))
        } finally {
            setFactoryResetting(false)
        }
    }

    return (
        <div className={`settings-popup${isExiting ? ' settings-popup--exiting' : ''}`} data-theme={config.display.theme} style={settingsStyles}>
            <div className="settings-popup__backdrop" onClick={handleClose} />
            <div className="settings-popup__container">
                <div className="settings-popup__header">
                    <h2 className="settings-popup__title">Configurações</h2>
                    <button className="settings-popup__close" onClick={handleClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="settings-popup__tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-popup__tab ${activeTab === tab.id ? 'settings-popup__tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="settings-popup__content">
                    {activeTab === 'appearance' && (
                        <AppearanceTab config={config} updateDisplay={updateDisplay} />
                    )}

                    {activeTab === 'widgets' && (
                        <WidgetsTab
                            widgets={config.widgets}
                            updateWidget={updateWidget}
                            moveWidget={moveWidget}
                        />
                    )}

                    {activeTab === 'shortcuts' && (
                        <ShortcutsTab
                            shortcuts={folderShortcuts}
                            updateShortcut={updateFolderShortcut}
                            moveShortcut={moveFolderShortcut}
                            removeShortcut={removeFolderShortcut}
                            addShortcut={addFolderShortcut}
                        />
                    )}

                    {activeTab === 'monitor' && (
                        <div className="settings-section">
                            <p className="settings-hint">Selecione em qual monitor a barra será exibida.</p>
                            <div className="monitor-list">
                                {monitors.map(monitor => (
                                    <MonitorCard
                                        key={monitor.id}
                                        monitor={monitor}
                                        isSelected={config.display.targetMonitor === monitor.id}
                                        onSelect={(id) => updateDisplay('targetMonitor', id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'about' && <AboutSection />}

                    {activeTab === 'system' && (
                        <SystemTab
                            isAdmin={isAdmin}
                            autostartEnabled={autostartEnabled}
                            factoryResetting={factoryResetting}
                            showFactoryResetConfirm={showFactoryResetConfirm}
                            factoryResetError={factoryResetError}
                            onAutostartToggle={handleAutostartToggle}
                            onFactoryResetClick={() => {
                                setFactoryResetError(null)
                                setShowFactoryResetConfirm(true)
                            }}
                            onFactoryResetConfirm={handleFactoryReset}
                            onFactoryResetCancel={() => {
                                setShowFactoryResetConfirm(false)
                                setFactoryResetError(null)
                            }}
                        />
                    )}
                </div>

                <div className="settings-popup__footer">
                    <button className="btn btn--secondary" onClick={handleClose}>
                        Cancelar
                    </button>
                    <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SettingsPopup
