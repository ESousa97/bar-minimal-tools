import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AppConfig, MonitorInfo, WidgetConfig } from '../types'
import { CloseIcon, CheckIcon, ChevronUpIcon, ChevronDownIcon, HexagonIcon } from './icons'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    config: AppConfig | null
    onConfigChange: (config: AppConfig) => void
}

type TabId = 'appearance' | 'widgets' | 'monitor' | 'about'

export function SettingsModal({ isOpen, onClose, config, onConfigChange }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('appearance')
    const [monitors, setMonitors] = useState<MonitorInfo[]>([])
    const [localConfig, setLocalConfig] = useState<AppConfig | null>(null)
    const [saving, setSaving] = useState(false)

    // Load monitors on mount
    useEffect(() => {
        if (isOpen) {
            invoke<MonitorInfo[]>('list_monitors').then(setMonitors).catch(console.error)
            setLocalConfig(config ? { ...config } : null)
        }
    }, [isOpen, config])

    if (!isOpen || !localConfig) return null

    const updateDisplay = <K extends keyof AppConfig['display']>(
        key: K,
        value: AppConfig['display'][K]
    ) => {
        setLocalConfig({
            ...localConfig,
            display: { ...localConfig.display, [key]: value }
        })
    }

    const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
        setLocalConfig({
            ...localConfig,
            widgets: localConfig.widgets.map(w =>
                w.id === id ? { ...w, ...updates } : w
            )
        })
    }

    const moveWidget = (id: string, direction: 'up' | 'down') => {
        const widgets = [...localConfig.widgets].sort((a, b) => a.order - b.order)
        const idx = widgets.findIndex(w => w.id === id)
        if (idx === -1) return

        const newIdx = direction === 'up' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= widgets.length) return

        // Swap orders
        const temp = widgets[idx].order
        widgets[idx].order = widgets[newIdx].order
        widgets[newIdx].order = temp

        setLocalConfig({ ...localConfig, widgets })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await invoke('save_current_profile', { config: localConfig })
            onConfigChange(localConfig)
            onClose()
        } catch (err) {
            console.error('Failed to save config:', err)
        } finally {
            setSaving(false)
        }
    }

    const tabs: { id: TabId; label: string }[] = [
        { id: 'appearance', label: 'Aparência' },
        { id: 'widgets', label: 'Widgets' },
        { id: 'monitor', label: 'Monitor' },
        { id: 'about', label: 'Sobre' },
    ]

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal__header">
                    <h2 className="modal__title">Configurações</h2>
                    <button className="modal__close" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="modal__tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`modal__tab ${activeTab === tab.id ? 'modal__tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="modal__content">
                    {activeTab === 'appearance' && (
                        <div className="settings-section">
                            <div className="setting-row">
                                <label className="setting-label">Tema</label>
                                <div className="setting-control">
                                    <button
                                        className={`theme-btn ${localConfig.display.theme === 'dark' ? 'theme-btn--active' : ''}`}
                                        onClick={() => updateDisplay('theme', 'dark')}
                                    >
                                        Escuro
                                    </button>
                                    <button
                                        className={`theme-btn ${localConfig.display.theme === 'light' ? 'theme-btn--active' : ''}`}
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
                                        value={localConfig.display.barHeight}
                                        onChange={e => updateDisplay('barHeight', parseInt(e.target.value))}
                                    />
                                    <span className="setting-value">{localConfig.display.barHeight}px</span>
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
                                        value={localConfig.display.opacity}
                                        onChange={e => updateDisplay('opacity', parseFloat(e.target.value))}
                                    />
                                    <span className="setting-value">{Math.round(localConfig.display.opacity * 100)}%</span>
                                </div>
                            </div>

                            <div className="setting-row">
                                <label className="setting-label">Efeito de Blur</label>
                                <div className="setting-control">
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={localConfig.display.blur}
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
                                {localConfig.widgets
                                    .sort((a, b) => a.order - b.order)
                                    .map(widget => (
                                        <div key={widget.id} className="widget-item">
                                            <div className="widget-item__controls">
                                                <button
                                                    className="widget-item__move"
                                                    onClick={() => moveWidget(widget.id, 'up')}
                                                    disabled={widget.order === 0}
                                                >
                                                    <ChevronUpIcon />
                                                </button>
                                                <button
                                                    className="widget-item__move"
                                                    onClick={() => moveWidget(widget.id, 'down')}
                                                    disabled={widget.order === localConfig.widgets.length - 1}
                                                >
                                                    <ChevronDownIcon />
                                                </button>
                                            </div>
                                            <span className="widget-item__name">
                                                {widget.type.charAt(0).toUpperCase() + widget.type.slice(1)}
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

                    {activeTab === 'monitor' && (
                        <div className="settings-section">
                            <p className="settings-hint">Selecione em qual monitor a barra será exibida.</p>
                            <div className="monitor-list">
                                {monitors.map(monitor => (
                                    <button
                                        key={monitor.id}
                                        className={`monitor-card ${localConfig.display.targetMonitor === monitor.id ? 'monitor-card--active' : ''}`}
                                        onClick={() => updateDisplay('targetMonitor', monitor.id)}
                                    >
                                        <div className="monitor-card__name">{monitor.name}</div>
                                        <div className="monitor-card__info">
                                            {monitor.width}x{monitor.height}
                                            {monitor.is_primary && <span className="badge">Principal</span>}
                                        </div>
                                        {localConfig.display.targetMonitor === monitor.id && (
                                            <div className="monitor-card__check">
                                                <CheckIcon />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="settings-section about-section">
                            <div className="about-logo"><HexagonIcon /></div>
                            <h3 className="about-title">Bar Minimal Tools</h3>
                            <p className="about-version">Versão 0.1.0</p>
                            <p className="about-description">
                                Uma barra de tarefas minimalista e personalizável para Windows,
                                com monitoramento de hardware em tempo real.
                            </p>
                            <div className="about-tech">
                                <span className="tech-badge">Tauri</span>
                                <span className="tech-badge">React</span>
                                <span className="tech-badge">Rust</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal__footer">
                    <button className="btn btn--secondary" onClick={onClose}>
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
