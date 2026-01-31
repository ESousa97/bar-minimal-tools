import { invoke } from '@tauri-apps/api/core'
import { AppConfig } from '../../../types'

interface AppearanceTabProps {
    config: AppConfig
    updateDisplay: <K extends keyof AppConfig['display']>(key: K, value: AppConfig['display'][K]) => void
}

export function AppearanceTab({ config, updateDisplay }: AppearanceTabProps) {
    return (
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
    )
}
