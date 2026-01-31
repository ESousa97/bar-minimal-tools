import { invoke } from '@tauri-apps/api/core'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import '../../index.css'
import { Note } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'

type InlineToken =
    | { type: 'text'; value: string }
    | { type: 'bold'; value: string }
    | { type: 'italic'; value: string }
    | { type: 'code'; value: string }

function tokenizeInline(input: string): InlineToken[] {
    // Minimal, safe inline “markdown-ish” tokenizer.
    // Supported: **bold**, *italic*, `code`
    const tokens: InlineToken[] = []
    let i = 0

    const pushText = (value: string) => {
        if (!value) return
        const last = tokens[tokens.length - 1]
        if (last?.type === 'text') {
            last.value += value
        } else {
            tokens.push({ type: 'text', value })
        }
    }

    while (i < input.length) {
        // code
        if (input[i] === '`') {
            const end = input.indexOf('`', i + 1)
            if (end !== -1) {
                tokens.push({ type: 'code', value: input.slice(i + 1, end) })
                i = end + 1
                continue
            }
        }
        // bold
        if (input.startsWith('**', i)) {
            const end = input.indexOf('**', i + 2)
            if (end !== -1) {
                tokens.push({ type: 'bold', value: input.slice(i + 2, end) })
                i = end + 2
                continue
            }
        }
        // italic
        if (input[i] === '*') {
            const end = input.indexOf('*', i + 1)
            if (end !== -1) {
                tokens.push({ type: 'italic', value: input.slice(i + 1, end) })
                i = end + 1
                continue
            }
        }

        pushText(input[i])
        i += 1
    }

    return tokens
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function inlineToRichHtml(input: string): string {
    const tokens = tokenizeInline(input)
    return tokens.map((t) => {
        switch (t.type) {
            case 'bold':
                return `<strong>${escapeHtml(t.value)}</strong>`
            case 'italic':
                return `<em>${escapeHtml(t.value)}</em>`
            case 'code':
                return `<code>${escapeHtml(t.value)}</code>`
            default:
                return escapeHtml(t.value)
        }
    }).join('')
}

function markdownToRichHtml(content: string): string {
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const trimmed = line.trim()

        if (!trimmed) {
            out.push('<div><br></div>')
            i += 1
            continue
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
            const text = trimmed.replace(/^#{1,3}\s+/, '')
            out.push(`<div class="notes-popup__rich-h">${inlineToRichHtml(text)}</div>`)
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
            out.push('<ul>')
            for (const it of items) {
                out.push(`<li>${inlineToRichHtml(it)}</li>`)
            }
            out.push('</ul>')
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
        out.push(`<div>${inlineToRichHtml(parts.join(' '))}</div>`)
    }

    return out.join('')
}

function inlineNodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (tag === 'BR') return '\n'

    if (tag === 'CODE') {
        return `\`${el.textContent || ''}\``
    }

    const inner = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('')
    if (tag === 'STRONG' || tag === 'B') return `**${inner}**`
    if (tag === 'EM' || tag === 'I') return `*${inner}*`
    return inner
}

function richToMarkdown(root: HTMLElement): string {
    const lines: string[] = []
    const push = (line: string) => lines.push(line)

    const block = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const t = (node.textContent || '').trim()
            if (t) push(t)
            return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return

        const el = node as HTMLElement
        const tag = el.tagName.toUpperCase()

        if (tag === 'UL') {
            const lis = Array.from(el.querySelectorAll(':scope > li'))
            for (const li of lis) {
                const txt = Array.from(li.childNodes).map(inlineNodeToMarkdown).join('').trim()
                push(txt ? `- ${txt}` : '- ')
            }
            push('')
            return
        }

        if (tag === 'DIV' || tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3') {
            const raw = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('')
            const text = raw.replace(/\s+$/g, '')
            if (!text.trim()) {
                push('')
                return
            }
            const isHeading = el.classList.contains('notes-popup__rich-h') || tag.startsWith('H')
            push(isHeading ? `# ${text.trim()}` : text.trim())
            return
        }

        const fallback = (el.textContent || '').trim()
        if (fallback) push(fallback)
    }

    for (const child of Array.from(root.childNodes)) {
        block(child)
    }

    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
}

function renderInline(input: string): ReactNode {
    const tokens = tokenizeInline(input)
    return tokens.map((t, idx) => {
        switch (t.type) {
            case 'bold':
                return <strong key={idx}>{t.value}</strong>
            case 'italic':
                return <em key={idx}>{t.value}</em>
            case 'code':
                return <code key={idx} className="notes-popup__inline-code">{t.value}</code>
            default:
                return <span key={idx}>{t.value}</span>
        }
    })
}

function snippetLine(content: string): string {
    const line = (content || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .find(l => l.length > 0) || ''

    // Clean block markers so the snippet feels WYSIWYG.
    return line
        .replace(/^#{1,3}\s+/, '')
        .replace(/^[-*]\s+/, '')
}

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

        // simple headings: #, ##, ###
        if (/^#{1,3}\s+/.test(trimmed)) {
            blocks.push({ type: 'h', text: trimmed.replace(/^#{1,3}\s+/, '') })
            i += 1
            continue
        }

        // bullets: - item
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

        // paragraph (collapse consecutive non-empty, non-list lines)
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

export default function NotesPopup() {
    const { isExiting } = usePopupExit()
    const [notes, setNotes] = useState<Note[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const saveTimerRef = useRef<number | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const richRef = useRef<HTMLDivElement | null>(null)
    const [devMode, setDevMode] = useState(false)
    const [mode, setMode] = useState<'list' | 'view' | 'edit'>('list')
    const [pinned, setPinned] = useState(false)
    const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

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

    const flushRichToMarkdown = () => {
        if (devMode) return
        const root = richRef.current
        if (!root) return
        if (!selected) return
        const md = richToMarkdown(root)
        if (md !== (selected.content || '')) {
            updateSelected({ content: md })
        }
    }

    useEffect(() => {
        if (!selected) return
        if (devMode) return
        if (mode !== 'edit') return
        const el = richRef.current
        if (!el) return
        el.innerHTML = markdownToRichHtml(selected.content || '')
    }, [selected, devMode, mode])

    const persist = (note: Note) => {
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
                        // Keep most recently updated first
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
    }

    const create = async () => {
        try {
            const note = await invoke<Note>('create_note', { title: 'Nova nota' })
            setNotes((prev) => [note, ...prev])
            setSelectedId(note.id)
            setDevMode(false)
            setMode('edit')
            setSaveState('idle')
            setLastSavedAt(note.updated_at)
        } catch (err) {
            console.warn('Failed to create note:', err)
        }
    }

    const remove = async () => {
        if (!selected) return
        const id = selected.id
        try {
            await invoke('delete_note', { id })
            setNotes((prev) => {
                const remaining = prev.filter(n => n.id !== id)
                // If we deleted the selected note, pick the next available.
                setSelectedId((prevSelected) => {
                    if (prevSelected !== id) return prevSelected
                    return remaining[0]?.id ?? null
                })
                return remaining
            })
            setDevMode(false)
            setMode('list')
            setSaveState('idle')
            setLastSavedAt(null)
        } catch (err) {
            console.warn('Failed to delete note:', err)
        }
    }

    const updateSelected = (updates: Partial<Pick<Note, 'title' | 'content'>>) => {
        if (!selected) return
        const next: Note = { ...selected, ...updates }
        setNotes((prev) => prev.map(n => (n.id === next.id ? next : n)))
        persist(next)
    }

    const saveLabel = (() => {
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
    })()

    const applyWrap = (before: string, after: string) => {
        if (!selected) return

        if (!devMode) {
            try {
                richRef.current?.focus()
                const cmd = before === '**' ? 'bold' : before === '*' ? 'italic' : ''
                if (cmd) {
                    document.execCommand(cmd)
                } else if (before === '`') {
                    const sel = window.getSelection()
                    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
                    if (range && range.toString()) {
                        const code = document.createElement('code')
                        range.surroundContents(code)
                    }
                }
            } catch {
                // ignore
            }

            const root = richRef.current
            if (root) {
                updateSelected({ content: richToMarkdown(root) })
            }
            return
        }

        const el = textareaRef.current
        if (!el) {
            // Fallback: append
            updateSelected({ content: (selected.content || '') + before + after })
            return
        }

        const value = el.value
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        const selectedText = value.slice(start, end)
        const nextValue = value.slice(0, start) + before + selectedText + after + value.slice(end)
        updateSelected({ content: nextValue })

        // Restore caret selection
        window.requestAnimationFrame(() => {
            try {
                el.focus()
                const caretStart = start + before.length
                const caretEnd = caretStart + selectedText.length
                el.setSelectionRange(caretStart, caretEnd)
            } catch {
                // ignore
            }
        })
    }

    const applyBullets = () => {
        if (!selected) return

        if (!devMode) {
            try {
                richRef.current?.focus()
                document.execCommand('insertUnorderedList')
            } catch {
                // ignore
            }
            const root = richRef.current
            if (root) {
                updateSelected({ content: richToMarkdown(root) })
            }
            return
        }

        const el = textareaRef.current
        const value = selected.content || ''

        if (!el) {
            const next = value ? `- ${value}` : '- '
            updateSelected({ content: next })
            return
        }

        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        const before = value.slice(0, start)
        const mid = value.slice(start, end)
        const after = value.slice(end)

        const lines = (mid || '').split(/\r?\n/)
        const nextMid = lines.map((l) => (l.trim().length ? `- ${l}` : l)).join('\n')
        const nextValue = before + nextMid + after
        updateSelected({ content: nextValue })

        window.requestAnimationFrame(() => {
            try {
                el.focus()
            } catch {
                // ignore
            }
        })
    }

    const goList = () => {
        if (mode === 'edit') flushRichToMarkdown()
        setDevMode(false)
        setMode('list')
    }

    const goView = () => {
        if (!selected) return
        if (mode === 'edit') flushRichToMarkdown()
        setDevMode(false)
        setMode('view')
    }

    const goEdit = () => {
        if (!selected) return
        setMode('edit')
    }

    const togglePinned = async () => {
        const next = !pinned
        setPinned(next)
        try {
            await invoke('set_popup_pinned', { popupName: 'notes-popup', pinned: next })
        } catch (err) {
            console.warn('Failed to set pinned:', err)
            setPinned(!next)
        }
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
                    <div className="notes-popup__list notes-popup__list--full">
                        <div className="notes-popup__list-header">
                            <button className="notes-popup__btn notes-popup__btn--primary" onClick={create}>+ Nova nota</button>
                        </div>
                        <div className="notes-popup__list-items">
                            {notes.length === 0 ? (
                                <div className="notes-popup__empty">Nenhuma nota</div>
                            ) : (
                                notes.map((n) => (
                                    <button
                                        key={n.id}
                                        className={`notes-popup__item${n.id === selectedId ? ' notes-popup__item--active' : ''}`}
                                        onClick={() => {
                                            setSelectedId(n.id)
                                            setDevMode(false)
                                            setMode('view')
                                        }}
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
                )}

                {mode === 'view' && (
                    <div className="notes-popup__view">
                        {selected ? (
                            <>
                                <div className="notes-popup__view-header">
                                    <div className="notes-popup__view-title">{selected.title || 'Sem título'}</div>
                                    <button className="notes-popup__btn notes-popup__btn--danger" onClick={remove}>Excluir</button>
                                </div>
                                <NotesPreview content={selected.content || ''} />
                            </>
                        ) : (
                            <div className="notes-popup__empty">Selecione uma nota</div>
                        )}
                    </div>
                )}

                {mode === 'edit' && (
                    <div className="notes-popup__editor notes-popup__editor--full">
                        {selected ? (
                            <>
                                <div className="notes-popup__editor-header">
                                    <input
                                        className="notes-popup__title"
                                        value={selected.title}
                                        onChange={(e) => updateSelected({ title: e.target.value })}
                                        placeholder="Título"
                                    />
                                    <button className="notes-popup__btn notes-popup__btn--danger" onClick={remove}>Excluir</button>
                                </div>

                                <div className="notes-popup__toolbar">
                                    <button className="notes-popup__tool" onClick={() => applyWrap('**', '**')} title="Negrito">B</button>
                                    <button className="notes-popup__tool" onClick={() => applyWrap('*', '*')} title="Itálico">I</button>
                                    <button className="notes-popup__tool" onClick={() => applyWrap('`', '`')} title="Código">{'</>'}</button>
                                    <button className="notes-popup__tool" onClick={applyBullets} title="Lista">•</button>
                                    <div className="notes-popup__tool-spacer" />
                                    <button
                                        className={`notes-popup__tool notes-popup__tool--toggle${devMode ? ' notes-popup__tool--active' : ''}`}
                                        onClick={() => {
                                            if (!devMode) flushRichToMarkdown()
                                            setDevMode((d) => !d)
                                        }}
                                        title="Dev"
                                    >
                                        Dev
                                    </button>
                                </div>

                                <div className={`notes-popup__status notes-popup__status--${saveState}`}>
                                    {saveLabel}
                                </div>

                                {devMode ? (
                                    <div className="notes-popup__content-area notes-popup__content-area--dev">
                                        <textarea
                                            ref={textareaRef}
                                            className="notes-popup__content notes-popup__content--dev"
                                            value={selected.content}
                                            onChange={(e) => updateSelected({ content: e.target.value })}
                                            placeholder="Markdown..."
                                        />
                                        <NotesPreview content={selected.content || ''} />
                                    </div>
                                ) : (
                                    <div
                                        ref={richRef}
                                        className="notes-popup__rich"
                                        contentEditable
                                        suppressContentEditableWarning
                                        data-placeholder="Escreva aqui..."
                                        onInput={() => {
                                            const root = richRef.current
                                            if (!root) return
                                            updateSelected({ content: richToMarkdown(root) })
                                        }}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="notes-popup__empty">Selecione uma nota para editar</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
