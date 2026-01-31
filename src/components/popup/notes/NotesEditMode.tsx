import { useCallback, useEffect, useRef, useState } from 'react'
import { Note } from '../../../types'
import { tokenizeInline } from './notesHelpers'
import { getSaveLabel } from './useNotes'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

// Markdown conversion utilities
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
    if (tag === 'CODE') return `\`${el.textContent || ''}\``

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

// NotesPreview component for dev mode
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

    const renderInline = (input: string) => {
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

interface NotesEditModeProps {
    selected: Note | null
    saveState: SaveState
    lastSavedAt: string | null
    onUpdate: (updates: Partial<Pick<Note, 'title' | 'content'>>) => void
    onRemove: () => void
}

export function NotesEditMode({ selected, saveState, lastSavedAt, onUpdate, onRemove }: NotesEditModeProps) {
    const [devMode, setDevMode] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)
    const richRef = useRef<HTMLDivElement | null>(null)

    const flushRichToMarkdown = useCallback(() => {
        if (devMode) return
        const root = richRef.current
        if (!root) return
        if (!selected) return
        const md = richToMarkdown(root)
        if (md !== (selected.content || '')) {
            onUpdate({ content: md })
        }
    }, [devMode, selected, onUpdate])

    useEffect(() => {
        if (!selected) return
        if (devMode) return
        const el = richRef.current
        if (!el) return
        el.innerHTML = markdownToRichHtml(selected.content || '')
    }, [selected, devMode])

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
                onUpdate({ content: richToMarkdown(root) })
            }
            return
        }

        const el = textareaRef.current
        if (!el) {
            onUpdate({ content: (selected.content || '') + before + after })
            return
        }

        const value = el.value
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        const selectedText = value.slice(start, end)
        const nextValue = value.slice(0, start) + before + selectedText + after + value.slice(end)
        onUpdate({ content: nextValue })

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
                onUpdate({ content: richToMarkdown(root) })
            }
            return
        }

        const el = textareaRef.current
        const value = selected.content || ''

        if (!el) {
            const next = value ? `- ${value}` : '- '
            onUpdate({ content: next })
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
        onUpdate({ content: nextValue })

        window.requestAnimationFrame(() => {
            try {
                el.focus()
            } catch {
                // ignore
            }
        })
    }

    if (!selected) {
        return <div className="notes-popup__empty">Selecione uma nota para editar</div>
    }

    const saveLabel = getSaveLabel(saveState, lastSavedAt)

    return (
        <div className="notes-popup__editor notes-popup__editor--full">
            <div className="notes-popup__editor-header">
                <input
                    className="notes-popup__title"
                    value={selected.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    placeholder="Título"
                />
                <button className="notes-popup__btn notes-popup__btn--danger" onClick={onRemove}>Excluir</button>
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
                        onChange={(e) => onUpdate({ content: e.target.value })}
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
                        onUpdate({ content: richToMarkdown(root) })
                    }}
                />
            )}
        </div>
    )
}
