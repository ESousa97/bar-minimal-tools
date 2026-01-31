import { useState } from 'react'
import '../../index.css'
import { usePopupExit } from '../../utils/usePopupExit'
import { NotesEditMode, NotesListView, NotesViewMode, useNotes } from './notes'

type ViewMode = 'list' | 'view' | 'edit'

export default function NotesPopup() {
    const { isExiting } = usePopupExit()
    const [mode, setMode] = useState<ViewMode>('list')

    const {
        notes,
        selectedId,
        selected,
        saveState,
        lastSavedAt,
        setSelectedId,
        create,
        remove,
        updateSelected,
        pinned,
        togglePinned,
    } = useNotes()

    const goList = () => {
        setMode('list')
    }

    const goView = () => {
        if (!selected) return
        setMode('view')
    }

    const goEdit = () => {
        if (!selected) return
        setMode('edit')
    }

    const handleCreate = async () => {
        await create()
        setMode('edit')
    }

    const handleRemove = async () => {
        await remove()
        setMode('list')
    }

    const handleSelect = (id: string) => {
        setSelectedId(id)
        setMode('view')
    }

    return (
        <div className={`popup-container notes-popup notes-popup--${mode}${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header notes-popup__header">
                <span className="popup-title">Notas</span>
                <div className="notes-popup__meta">
                    <span className="notes-popup__count">{notes.length} {notes.length === 1 ? 'nota' : 'notas'}</span>
                </div>
            </div>

            <div className="notes-popup__nav">
                <button
                    className={`notes-popup__tool notes-popup__tool--toggle${mode === 'list' ? ' notes-popup__tool--active' : ''}`}
                    onClick={goList}
                    title="Lista"
                >
                    Lista
                </button>
                <button
                    className={`notes-popup__tool notes-popup__tool--toggle${mode === 'view' ? ' notes-popup__tool--active' : ''}`}
                    onClick={goView}
                    disabled={!selected}
                    title="Ver"
                >
                    Ver
                </button>
                <button
                    className={`notes-popup__tool notes-popup__tool--toggle${mode === 'edit' ? ' notes-popup__tool--active' : ''}`}
                    onClick={goEdit}
                    disabled={!selected}
                    title="Editar"
                >
                    Editar
                </button>

                <div className="notes-popup__nav-spacer" />

                <button
                    className={`notes-popup__tool notes-popup__tool--toggle${pinned ? ' notes-popup__tool--active' : ''}`}
                    onClick={togglePinned}
                    title={pinned ? 'Desafixar (volta a fechar ao perder foco)' : 'Fixar (não fecha ao perder foco)'}
                >
                    Fixar
                </button>
            </div>

            <div className="notes-popup__body">
                {mode === 'list' && (
                    <NotesListView
                        notes={notes}
                        selectedId={selectedId}
                        onCreate={handleCreate}
                        onSelect={handleSelect}
                    />
                )}

                {mode === 'view' && (
                    <NotesViewMode selected={selected} onRemove={handleRemove} />
                )}

                {mode === 'edit' && (
                    <NotesEditMode
                        selected={selected}
                        saveState={saveState}
                        lastSavedAt={lastSavedAt}
                        onUpdate={updateSelected}
                        onRemove={handleRemove}
                    />
                )}
            </div>
        </div>
    )
}
