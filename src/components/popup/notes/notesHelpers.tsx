import type { ReactNode } from 'react'

type InlineToken =
    | { type: 'text'; value: string }
    | { type: 'bold'; value: string }
    | { type: 'italic'; value: string }
    | { type: 'code'; value: string }

export function tokenizeInline(input: string): InlineToken[] {
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
        if (input[i] === '`') {
            const end = input.indexOf('`', i + 1)
            if (end !== -1) {
                tokens.push({ type: 'code', value: input.slice(i + 1, end) })
                i = end + 1
                continue
            }
        }
        if (input.startsWith('**', i)) {
            const end = input.indexOf('**', i + 2)
            if (end !== -1) {
                tokens.push({ type: 'bold', value: input.slice(i + 2, end) })
                i = end + 2
                continue
            }
        }
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

export function renderInline(input: string): ReactNode {
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

export function snippetLine(content: string): string {
    const line = (content || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .find(l => l.length > 0) || ''

    return line
        .replace(/^#{1,3}\s+/, '')
        .replace(/^[-*]\s+/, '')
}
