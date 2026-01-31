import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../../index.css'
import { AppConfig, FolderShortcut, FolderShortcutsConfig, MonitorInfo, WidgetConfig } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'
import { getWidgetLabel, normalizeConfig } from '../../utils/widgets'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, getFolderIconByName } from '../icons'
import { AboutSection, MonitorCard } from '../shared/SettingsShared'

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
                        <div className="settings-section">
                            <div className="setting-row">
                                <label className="setting-label">Tema</label>
                                <div className="setting-control">
                                    <button
                                        className={`theme-btn ${config.display.theme === 'dark' ? 'theme-btn--active' : ''}`}
                                        onClick={() => updateDisplay('theme', 'dark')}
                                    >
                                        Escuro
                                    </button>
                                    <button
                                        className={`theme-btn ${config.display.theme === 'light' ? 'theme-btn--active' : ''}`}
                                        onClick={() => updateDisplay('theme', 'light')}
                                    >
                                        Claro
                                    </button>
                                </div>
                            </div>

                            <div className="setting-row">
                                <label className="setting-label">Altura da Barra</label>
                                <div className="setting-control">
                                    <input
                                        type="range"
                                        min="24"
                                        max="48"
                                        value={config.display.barHeight}
                                        onChange={e => updateDisplay('barHeight', parseInt(e.target.value))}
                                        onPointerUp={() => {
                                            // On drag end, update the AppBar reserved area once to prevent flicker.
                                            invoke('preview_taskbar_height', { barHeight: config.display.barHeight, updateAppbar: true }).catch(() => { })
                                        }}
                                    />
                                    <span className="setting-value">{config.display.barHeight}px</span>
                                </div>
                            </div>

                            <div className="setting-row">
                                <label className="setting-label">Opacidade</label>
                                <div className="setting-control">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={config.display.opacity}
                                        onChange={e => updateDisplay('opacity', parseFloat(e.target.value))}
                                    />
                                    <span className="setting-value">{Math.round(config.display.opacity * 100)}%</span>
                                </div>
                            </div>

                            <div className="setting-row">
                                <label className="setting-label">Efeito de Blur</label>
                                <div className="setting-control">
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={config.display.blur}
                                            onChange={e => updateDisplay('blur', e.target.checked)}
                                        />
                                        <span className="toggle__slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'widgets' && (
                        <div className="settings-section">
                            <p className="settings-hint">Arraste para reordenar ou clique no toggle para ativar/desativar.</p>
                            <div className="widget-list">
                                {config.widgets
                                    .slice()
                                    .sort((a, b) => a.order - b.order)
                                    .map((widget, idx, arr) => (
                                        <div key={widget.id} className="widget-item">
                                            <div className="widget-item__controls">
                                                <button
                                                    className="widget-item__move"
                                                    onClick={() => moveWidget(widget.id, 'up')}
                                                    disabled={idx === 0}
                                                >
                                                    <ChevronUpIcon />
                                                </button>
                                                <button
                                                    className="widget-item__move"
                                                    onClick={() => moveWidget(widget.id, 'down')}
                                                    disabled={idx === arr.length - 1}
                                                >
                                                    <ChevronDownIcon />
                                                </button>
                                            </div>
                                            <span className="widget-item__name">
                                                {getWidgetLabel(widget.type)}
                                            </span>
                                            <label className="toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={widget.enabled}
                                                    onChange={e => updateWidget(widget.id, { enabled: e.target.checked })}
                                                />
                                                <span className="toggle__slider"></span>
                                            </label>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'shortcuts' && (
                        <div className="settings-section">
                            <p className="settings-hint">Gerencie os atalhos de pastas do menu hambúrguer.</p>
                            <div className="widget-list">
                                {folderShortcuts.map((shortcut, idx, arr) => (
                                    <div key={shortcut.id} className="widget-item folder-shortcut-item">
                                        <div className="widget-item__controls">
                                            <button
                                                className="widget-item__move"
                                                onClick={() => moveFolderShortcut(shortcut.id, 'up')}
                                                disabled={idx === 0}
                                            >
                                                <ChevronUpIcon />
                                            </button>
                                            <button
                                                className="widget-item__move"
                                                onClick={() => moveFolderShortcut(shortcut.id, 'down')}
                                                disabled={idx === arr.length - 1}
                                            >
                                                <ChevronDownIcon />
                                            </button>
                                        </div>
                                        <span className="folder-shortcut-item__icon">
                                            {getFolderIconByName(shortcut.icon)}
                                        </span>
                                        <div className="folder-shortcut-item__fields">
                                            <input
                                                type="text"
                                                className="folder-shortcut-item__name-input"
                                                value={shortcut.name}
                                                placeholder="Nome"
                                                onChange={e => updateFolderShortcut(shortcut.id, { name: e.target.value })}
                                            />
                                            <input
                                                type="text"
                                                className="folder-shortcut-item__path-input"
                                                value={shortcut.path}
                                                placeholder="Caminho da pasta"
                                                onChange={e => updateFolderShortcut(shortcut.id, { path: e.target.value })}
                                            />
                                        </div>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={shortcut.enabled}
                                                onChange={e => updateFolderShortcut(shortcut.id, { enabled: e.target.checked })}
                                            />
                                            <span className="toggle__slider"></span>
                                        </label>
                                        <button
                                            className="folder-shortcut-item__remove"
                                            title="Remover"
                                            onClick={() => removeFolderShortcut(shortcut.id)}
                                        >
                                            <CloseIcon />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button className="btn btn--secondary add-shortcut-btn" onClick={addFolderShortcut}>
                                + Adicionar Atalho
                            </button>
                        </div>
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
                        <div className="settings-section">
                            {!isAdmin && (
                                <div className="setting-row setting-row--warning">
                                    <div className="setting-warning">
                                        <span className="setting-warning__icon">⚠️</span>
                                        <div className="setting-warning__content">
                                            <span className="setting-warning__title">Modo Limitado</span>
                                            <span className="setting-warning__text">
                                                A aplicação está rodando sem privilégios de administrador.
                                                Alguns recursos como reserva de espaço da barra (AppBar) podem não funcionar corretamente.
                                                Para recursos completos, feche e execute como Administrador.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isAdmin && (
                                <div className="setting-row setting-row--success">
                                    <div className="setting-success">
                                        <span className="setting-success__icon">✓</span>
                                        <span className="setting-success__text">Executando com privilégios de administrador</span>
                                    </div>
                                </div>
                            )}

                            <div className="setting-row">
                                <label className="setting-label">
                                    <span>Iniciar com Windows</span>
                                    <span className="setting-hint">Abrir automaticamente ao iniciar o sistema</span>
                                </label>
                                <div className="setting-control">
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={autostartEnabled}
                                            onChange={e => handleAutostartToggle(e.target.checked)}
                                        />
                                        <span className="toggle__slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div className="setting-row">
                                <label className="setting-label">
                                    <span>Resetar configurações</span>
                                    <span className="setting-hint">Apaga perfil/config/cache e recria o Default do zero</span>
                                </label>
                                <div className="setting-control">
                                    <button
                                        className="btn btn--danger"
                                        disabled={factoryResetting}
                                        onClick={() => {
                                            setFactoryResetError(null)
                                            setShowFactoryResetConfirm(true)
                                        }}
                                    >
                                        {factoryResetting ? 'Resetando...' : 'Factory Reset'}
                                    </button>
                                </div>
                            </div>

                            {showFactoryResetConfirm && (
                                <div className="settings-reset">
                                    <div className="settings-reset__title">Confirmação</div>
                                    <div className="settings-reset__text">
                                        Isso vai apagar perfis/config/cache e recriar tudo do zero.
                                        {factoryResetError ? `\n\nErro: ${factoryResetError}` : ''}
                                    </div>
                                    <div className="settings-reset__actions">
                                        <button
                                            className="btn btn--secondary"
                                            disabled={factoryResetting}
                                            onClick={() => {
                                                setShowFactoryResetConfirm(false)
                                                setFactoryResetError(null)
                                            }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            className="btn btn--danger"
                                            disabled={factoryResetting}
                                            onClick={handleFactoryReset}
                                        >
                                            Confirmar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
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
