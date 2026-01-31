import { MonitorInfo } from '../../types'
import { CheckIcon, HexagonIcon } from '../icons'

// ====================
// MonitorCard Component
// ====================
interface MonitorCardProps {
    monitor: MonitorInfo
    isSelected: boolean
    onSelect: (id: string) => void
}

export function MonitorCard({ monitor, isSelected, onSelect }: MonitorCardProps) {
    return (
        <button
            className={`monitor-card ${isSelected ? 'monitor-card--active' : ''}`}
            onClick={() => onSelect(monitor.id)}
        >
            <div className="monitor-card__name">{monitor.name}</div>
            <div className="monitor-card__info">
                {monitor.width}x{monitor.height}
                {monitor.is_primary && <span className="badge">Principal</span>}
            </div>
            {isSelected && (
                <div className="monitor-card__check">
                    <CheckIcon />
                </div>
            )}
        </button>
    )
}

// ====================
// AboutSection Component
// ====================
export function AboutSection() {
    return (
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
    )
}
