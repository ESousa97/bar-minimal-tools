import { FolderShortcut } from '../../../types'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, getFolderIconByName } from '../../icons'

interface ShortcutsTabProps {
    shortcuts: FolderShortcut[]
    updateShortcut: (id: string, updates: Partial<FolderShortcut>) => void
    moveShortcut: (id: string, direction: 'up' | 'down') => void
    removeShortcut: (id: string) => void
    addShortcut: () => void
}

export function ShortcutsTab({
    shortcuts,
    updateShortcut,
    moveShortcut,
    removeShortcut,
    addShortcut,
}: ShortcutsTabProps) {
    return (
        <div className="settings-section">
            <p className="settings-hint">Gerencie os atalhos de pastas do menu hambúrguer.</p>
            <div className="widget-list">
                {shortcuts.map((shortcut, idx, arr) => (
                    <div key={shortcut.id} className="widget-item folder-shortcut-item">
                        <div className="widget-item__controls">
                            <button
                                className="widget-item__move"
                                onClick={() => moveShortcut(shortcut.id, 'up')}
                                disabled={idx === 0}
                            >
                                <ChevronUpIcon />
                            </button>
                            <button
                                className="widget-item__move"
                                onClick={() => moveShortcut(shortcut.id, 'down')}
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
                                onChange={e => updateShortcut(shortcut.id, { name: e.target.value })}
                            />
                            <input
                                type="text"
                                className="folder-shortcut-item__path-input"
                                value={shortcut.path}
                                placeholder="Caminho da pasta"
                                onChange={e => updateShortcut(shortcut.id, { path: e.target.value })}
                            />
                        </div>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={shortcut.enabled}
                                onChange={e => updateShortcut(shortcut.id, { enabled: e.target.checked })}
                            />
                            <span className="toggle__slider"></span>
                        </label>
                        <button
                            className="folder-shortcut-item__remove"
                            title="Remover"
                            onClick={() => removeShortcut(shortcut.id)}
                        >
                            <CloseIcon />
                        </button>
                    </div>
                ))}
            </div>
            <button className="btn btn--secondary add-shortcut-btn" onClick={addShortcut}>
                + Adicionar Atalho
            </button>
        </div>
    )
}
