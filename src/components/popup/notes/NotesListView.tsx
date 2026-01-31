import { Note } from '../../../types'
import { renderInline, snippetLine } from './notesHelpers'

interface NotesListViewProps {
    notes: Note[]
    selectedId: string | null
    onCreate: () => void
    onSelect: (id: string) => void
}

export function NotesListView({ notes, selectedId, onCreate, onSelect }: NotesListViewProps) {
    return (
        <div className="notes-popup__list notes-popup__list--full">
            <div className="notes-popup__list-header">
                <button className="notes-popup__btn notes-popup__btn--primary" onClick={onCreate}>+ Nova nota</button>
            </div>
            <div className="notes-popup__list-items">
                {notes.length === 0 ? (
                    <div className="notes-popup__empty">Nenhuma nota</div>
                ) : (
                    notes.map((n) => (
                        <button
                            key={n.id}
                            className={`notes-popup__item${n.id === selectedId ? ' notes-popup__item--active' : ''}`}
                            onClick={() => onSelect(n.id)}
                            title={n.title}
                        >
                            <span className="notes-popup__item-title">{n.title || 'Sem título'}</span>
                            <span className="notes-popup__item-snippet">
                                {renderInline(snippetLine(n.content || ''))}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}
