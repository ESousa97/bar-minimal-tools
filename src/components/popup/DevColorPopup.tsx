import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import '../../index.css'
import { usePopupExit } from '../../utils/usePopupExit'

type CopyFormat = 'hex' | 'rgba'

function hexToRgba(hex: string): string | null {
    const raw = hex.replace('#', '').trim()
    if (raw.length === 3) {
        const r = parseInt(raw[0] + raw[0], 16)
        const g = parseInt(raw[1] + raw[1], 16)
        const b = parseInt(raw[2] + raw[2], 16)
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
        return `rgba(${r}, ${g}, ${b}, 1)`
    }
    if (raw.length === 6) {
        const r = parseInt(raw.slice(0, 2), 16)
        const g = parseInt(raw.slice(2, 4), 16)
        const b = parseInt(raw.slice(4, 6), 16)
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
        return `rgba(${r}, ${g}, ${b}, 1)`
    }
    return null
}

async function copyToClipboard(value: string): Promise<void> {
    try {
        await writeText(value)
    } catch {
        // ignore
    }
}

type EyeDropperResult =
    | { status: 'picked'; color: string }
    | { status: 'cancelled' }

async function pickColorWithEyedropper(): Promise<EyeDropperResult> {
    const EyeDropperCtor = window.EyeDropper
    if (!EyeDropperCtor) {
        // Unsupported in this WebView/runtime.
        return { status: 'cancelled' }
    }

    try {
        const eyeDropper = new EyeDropperCtor()
        const result = await eyeDropper.open()
        return { status: 'picked', color: result.sRGBHex }
    } catch {
        // User pressed Esc / cancelled.
        return { status: 'cancelled' }
    }
}

export default function DevColorPopup() {
    const { isExiting, handleClose } = usePopupExit()
    const colorInputRef = useRef<HTMLInputElement>(null)

    const [lastColor, setLastColor] = useState<string>(() => {
        try {
            return window.localStorage.getItem('dev:colorPicker:last') || '#22d3ee'
        } catch {
            return '#22d3ee'
        }
    })

    const [lastCopied, setLastCopied] = useState<string>(() => {
        try {
            return window.localStorage.getItem('dev:colorPicker:lastCopied') || ''
        } catch {
            return ''
        }
    })

    const [copyFormat, setCopyFormat] = useState<CopyFormat>(() => {
        try {
            const v = window.localStorage.getItem('dev:colorPicker:copyFormat')
            return v === 'rgba' ? 'rgba' : 'hex'
        } catch {
            return 'hex'
        }
    })

    useEffect(() => {
        document.documentElement.style.setProperty('--dev-picked-color', lastColor)
        try {
            window.localStorage.setItem('dev:colorPicker:last', lastColor)
        } catch {
            // ignore
        }
    }, [lastColor])

    useEffect(() => {
        try {
            window.localStorage.setItem('dev:colorPicker:copyFormat', copyFormat)
        } catch {
            // ignore
        }
    }, [copyFormat])

    // Keep state synced across windows (taskbar <-> popup)
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'dev:colorPicker:last' && typeof e.newValue === 'string' && e.newValue) {
                setLastColor(e.newValue)
            }
            if (e.key === 'dev:colorPicker:lastCopied') {
                setLastCopied(e.newValue || '')
            }
            if (e.key === 'dev:colorPicker:copyFormat') {
                setCopyFormat(e.newValue === 'rgba' ? 'rgba' : 'hex')
            }
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const rgbaValue = useMemo(() => hexToRgba(lastColor), [lastColor])

    const currentValue = useMemo(() => {
        return copyFormat === 'rgba' ? rgbaValue ?? lastColor : lastColor
    }, [copyFormat, rgbaValue, lastColor])

    const persistLastCopied = (value: string) => {
        setLastCopied(value)
        try {
            window.localStorage.setItem('dev:colorPicker:lastCopied', value)
        } catch {
            // ignore
        }
    }

    const copyAndClose = async (value: string) => {
        await copyToClipboard(value)
        persistLastCopied(value)
        await handleClose()
    }

    const openFallbackSelector = () => {
        colorInputRef.current?.click()
    }

    const pickAndCopy = async () => {
        // If EyeDropper isn't supported, use the native picker.
        if (!window.EyeDropper) {
            openFallbackSelector()
            return
        }

        const result = await pickColorWithEyedropper()
        if (result.status !== 'picked') {
            // Cancelled (Esc). Do nothing.
            return
        }

        setLastColor(result.color)

        const toCopy = copyFormat === 'rgba' ? hexToRgba(result.color) ?? result.color : result.color
        await copyAndClose(toCopy)
    }

    const handleKeyActivate = (e: KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            action()
        }
    }

    const renderSelectableItem = (opts: {
        title: string
        value: string
        selected: boolean
        onActivate: () => void
        badge?: string
    }) => (
        <div
            className={`audio-device audio-device--selectable${opts.selected ? ' audio-device--default' : ''}`}
            role="button"
            tabIndex={0}
            onClick={opts.onActivate}
            onKeyDown={(e) => handleKeyActivate(e, opts.onActivate)}
        >
            <div className="audio-device__header">
                <div className="audio-device__icon">
                    <span className="dev-color-preview__swatch" aria-hidden="true" />
                </div>
                <div className="audio-device__name">{opts.title}</div>
                {opts.badge && <span className="audio-device__badge">{opts.badge}</span>}
                <span
                    className={`audio-device__selector${opts.selected ? ' audio-device__selector--on' : ''}`}
                    aria-hidden="true"
                />
            </div>
            <div className="audio-device__volume">
                <span className="audio-device__volume-value">{opts.value}</span>
            </div>
        </div>
    )

    return (
        <div className={`popup-container popup-container--dev-color${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Cores (DEV)</span>
            </div>

            <div className="popup-content">
                <div className="audio-section">
                    <div className="audio-section__title">Atual e último copiado</div>

                    <div
                        className="audio-device audio-device--selectable"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            void copyToClipboard(currentValue).then(() => {
                                persistLastCopied(currentValue)
                            })
                        }}
                        onKeyDown={(e) => {
                            handleKeyActivate(e, () => {
                                void copyToClipboard(currentValue).then(() => {
                                    persistLastCopied(currentValue)
                                })
                            })
                        }}
                    >
                        <div className="audio-device__header">
                            <div className="audio-device__name">Atual</div>
                            <span className="audio-device__badge">Copiar</span>
                        </div>
                        <div className="audio-device__volume">
                            <span className="audio-device__volume-value">{currentValue}</span>
                        </div>
                    </div>

                    <div
                        className={`audio-device${lastCopied ? ' audio-device--selectable' : ''}`}
                        role={lastCopied ? 'button' : undefined}
                        tabIndex={lastCopied ? 0 : undefined}
                        onClick={() => {
                            if (!lastCopied) return
                            void copyToClipboard(lastCopied).then(() => {
                                persistLastCopied(lastCopied)
                            })
                        }}
                        onKeyDown={(e) => {
                            if (!lastCopied) return
                            handleKeyActivate(e, () => {
                                void copyToClipboard(lastCopied).then(() => {
                                    persistLastCopied(lastCopied)
                                })
                            })
                        }}
                    >
                        <div className="audio-device__header">
                            <div className="audio-device__name">Último copiado</div>
                            {lastCopied ? <span className="audio-device__badge">Copiar</span> : null}
                        </div>
                        <div className="audio-device__volume">
                            <span className="audio-device__volume-value">{lastCopied || '-'}</span>
                        </div>
                    </div>
                </div>

                <div className="audio-section">
                    <div className="audio-section__title">Formato</div>
                    {renderSelectableItem({
                        title: 'HEX',
                        value: lastColor,
                        selected: copyFormat === 'hex',
                        badge: copyFormat === 'hex' ? 'Padrão' : undefined,
                        onActivate: () => {
                            setCopyFormat('hex')
                            void copyAndClose(lastColor)
                        },
                    })}

                    {renderSelectableItem({
                        title: 'RGBA',
                        value: rgbaValue ?? lastColor,
                        selected: copyFormat === 'rgba',
                        badge: copyFormat === 'rgba' ? 'Padrão' : undefined,
                        onActivate: () => {
                            const rgba = rgbaValue ?? lastColor
                            setCopyFormat('rgba')
                            void copyAndClose(rgba)
                        },
                    })}
                </div>

                <div className="audio-section">
                    <div className="audio-section__title">Seletor</div>
                    {renderSelectableItem({
                        title: 'Capturar',
                        value: copyFormat.toUpperCase(),
                        selected: false,
                        onActivate: () => {
                            void pickAndCopy()
                        },
                    })}
                </div>

                {/* Hidden fallback selector (opens when EyeDropper isn't available) */}
                <div className="dev-color-hidden">
                    <input
                        ref={colorInputRef}
                        type="color"
                        value={lastColor}
                        onChange={(e) => {
                            const next = e.target.value
                            if (!next || next === lastColor) return
                            setLastColor(next)
                            const toCopy = copyFormat === 'rgba' ? hexToRgba(next) ?? next : next
                            void copyAndClose(toCopy)
                        }}
                        aria-label="Selecionar cor"
                    />
                </div>
            </div>
        </div>
    )
}
