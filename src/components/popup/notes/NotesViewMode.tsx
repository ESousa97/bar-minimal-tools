import { Note } from '../../../types'
import { NotesPreview } from './NotesPreview'

interface NotesViewModeProps {
    selected: Note | null
    onRemove: () => void
}

export function NotesViewMode({ selected, onRemove }: NotesViewModeProps) {
    if (!selected) {
        return <div className="notes-popup__empty">Selecione uma nota</div>
    }

    return (
        <div className="notes-popup__view">
            <div className="notes-popup__view-header">
                <div className="notes-popup__view-title">{selected.title || 'Sem título'}</div>
                <button className="notes-popup__btn notes-popup__btn--danger" onClick={onRemove}>Excluir</button>
            </div>
            <NotesPreview content={selected.content || ''} />
        </div>
    )
}
