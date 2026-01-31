import { Note } from '../../../types'
import { renderInline } from './notesHelpers'

function NotesPreview({ content }: { content: string }) {
    const lines = content.replace(/\r\n/g, '\n').split('\n')

    const blocks: Array<
        | { type: 'p'; text: string }
        | { type: 'ul'; items: string[] }
        | { type: 'h'; text: string }
        | { type: 'spacer' }
    > = []

    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        const trimmed = line.trim()

        if (!trimmed) {
            blocks.push({ type: 'spacer' })
            i += 1
            continue
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
            blocks.push({ type: 'h', text: trimmed.replace(/^#{1,3}\s+/, '') })
            i += 1
            continue
        }

        if (/^[-*]\s+/.test(trimmed)) {
            const items: string[] = []
            while (i < lines.length) {
                const t = lines[i].trim()
                if (!/^[-*]\s+/.test(t)) break
                items.push(t.replace(/^[-*]\s+/, ''))
                i += 1
            }
            blocks.push({ type: 'ul', items })
            continue
        }

        const parts: string[] = [trimmed]
        i += 1
        while (i < lines.length) {
            const next = lines[i].trim()
            if (!next) break
            if (/^[-*]\s+/.test(next)) break
            if (/^#{1,3}\s+/.test(next)) break
            parts.push(next)
            i += 1
        }
        blocks.push({ type: 'p', text: parts.join(' ') })
    }

    return (
        <div className="notes-popup__preview">
            {blocks.map((b, idx) => {
                if (b.type === 'spacer') return <div key={idx} className="notes-popup__spacer" />
                if (b.type === 'h') return <div key={idx} className="notes-popup__h">{renderInline(b.text)}</div>
                if (b.type === 'ul') {
                    return (
                        <ul key={idx} className="notes-popup__ul">
                            {b.items.map((it, j) => (
                                <li key={j}>{renderInline(it)}</li>
                            ))}
                        </ul>
                    )
                }
                return <div key={idx} className="notes-popup__p">{renderInline(b.text)}</div>
            })}
        </div>
    )
}

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
