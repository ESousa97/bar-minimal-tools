import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Note } from '../../../types'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface UseNotesReturn {
    notes: Note[]
    selectedId: string | null
    selected: Note | null
    saveState: SaveState
    lastSavedAt: string | null
    setSelectedId: (id: string | null) => void
    create: () => Promise<void>
    remove: () => Promise<void>
    updateSelected: (updates: Partial<Pick<Note, 'title' | 'content'>>) => void
    pinned: boolean
    togglePinned: () => Promise<void>
}

export function useNotes(): UseNotesReturn {
    const [notes, setNotes] = useState<Note[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [pinned, setPinned] = useState(false)
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
    const saveTimerRef = useRef<number | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const list = await invoke<Note[]>('list_notes')
                setNotes(list)
                setSelectedId(list[0]?.id ?? null)
                setSaveState('idle')
                setLastSavedAt(list[0]?.updated_at ?? null)
                const isPinned = await invoke<boolean>('get_popup_pinned', { popupName: 'notes-popup' })
                setPinned(isPinned)
            } catch (err) {
                console.warn('Failed to load notes:', err)
            }
        }
        load()

        return () => {
            if (saveTimerRef.current) {
                window.clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
            }
        }
    }, [])

    const selected = useMemo(() => notes.find(n => n.id === selectedId) ?? null, [notes, selectedId])

    const persist = useCallback((note: Note) => {
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current)
        }

        setSaveState('dirty')

        saveTimerRef.current = window.setTimeout(() => {
            setSaveState('saving')
            void invoke<Note>('update_note', { id: note.id, title: note.title, content: note.content })
                .then((updated) => {
                    setNotes((prev) => {
                        const next = prev.map(n => (n.id === updated.id ? updated : n))
                        next.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
                        return next
                    })
                    setLastSavedAt(updated.updated_at)
                    setSaveState('saved')
                })
                .catch((err) => {
                    console.warn('Failed to save note:', err)
                    setSaveState('error')
                })
        }, 350)
    }, [])

    const create = useCallback(async () => {
        try {
            const note = await invoke<Note>('create_note', { title: 'Nova nota' })
            setNotes((prev) => [note, ...prev])
            setSelectedId(note.id)
            setSaveState('idle')
            setLastSavedAt(note.updated_at)
        } catch (err) {
            console.warn('Failed to create note:', err)
        }
    }, [])

    const remove = useCallback(async () => {
        if (!selected) return
        const id = selected.id
        try {
            await invoke('delete_note', { id })
            setNotes((prev) => {
                const remaining = prev.filter(n => n.id !== id)
                setSelectedId((prevSelected) => {
                    if (prevSelected !== id) return prevSelected
                    return remaining[0]?.id ?? null
                })
                return remaining
            })
            setSaveState('idle')
            setLastSavedAt(null)
        } catch (err) {
            console.warn('Failed to delete note:', err)
        }
    }, [selected])

    const updateSelected = useCallback((updates: Partial<Pick<Note, 'title' | 'content'>>) => {
        if (!selected) return
        const next: Note = { ...selected, ...updates }
        setNotes((prev) => prev.map(n => (n.id === next.id ? next : n)))
        persist(next)
    }, [selected, persist])

    const togglePinned = useCallback(async () => {
        const next = !pinned
        setPinned(next)
        try {
            await invoke('set_popup_pinned', { popupName: 'notes-popup', pinned: next })
        } catch (err) {
            console.warn('Failed to set pinned:', err)
            setPinned(!next)
        }
    }, [pinned])

    return {
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
    }
}

export function getSaveLabel(saveState: SaveState, lastSavedAt: string | null): string {
    switch (saveState) {
        case 'saving':
            return 'Salvando...'
        case 'error':
            return 'Falha ao salvar'
        case 'saved':
            return 'Salvo'
        case 'dirty':
            return 'Alterações pendentes'
        default:
            return lastSavedAt ? 'Salvo' : ''
    }
}
