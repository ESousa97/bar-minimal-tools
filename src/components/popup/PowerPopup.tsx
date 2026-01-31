import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import '../../index.css'
import { AppConfig } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'
import { LockIcon, PowerIcon, RefreshIcon, SignOutIcon, TaskManagerIcon } from '../icons'

export default function PowerPopup() {
    const [config, setConfig] = useState<AppConfig | null>(null)
    const { isExiting, handleClose } = usePopupExit({
        autoCloseOnBlur: true,
        closeAction: async () => {
            try {
                // Use close() instead of hide() - fullscreen opaque windows don't hide properly on Windows.
                await getCurrentWindow().close()
            } catch {
                // ignore
            }
        },
    })

    useEffect(() => {
        const load = async () => {
            try {
                const profile = await invoke<AppConfig>('get_active_profile')
                setConfig(profile)
            } catch {
                setConfig(null)
            }
        }
        load()
    }, [])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                handleClose()
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [handleClose])

    const display = config?.display
    const barHeight = display?.barHeight ?? 32
    const blurEnabled = display?.blur ?? true
    const theme = display?.theme ?? 'dark'

    const baseBlurPx = Math.max(12, Math.min(48, Math.round(barHeight * 0.75)))
    const blurAmountPx = blurEnabled ? baseBlurPx : 0
    const baseRgb = theme === 'light' ? [245, 245, 250] : [15, 15, 20]
    // Power menu should be solid (no glass/transparent surface).
    const alpha = 1

    const styles: CSSProperties = {
        ['--bar-height' as string]: `${barHeight}px`,
        ['--blur-amount' as string]: `${blurAmountPx}px`,
        ['--bar-bg' as string]: `rgba(${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}, ${alpha})`,
    }

    const run = async (cmd: string) => {
        try {
            await invoke(cmd)
        } catch (err) {
            console.warn(`Failed to run ${cmd}:`, err)
        } finally {
            // If we're quitting the whole app, avoid racing window close during teardown.
            if (cmd !== 'quit_app') {
                handleClose()
            }
        }
    }

    const actions: Array<{
        label: string
        cmd: string
        icon: ReactNode
        tone: 'danger' | 'warning' | 'primary' | 'neutral'
    }> = [
        { label: 'Desligar', cmd: 'system_shutdown', icon: <PowerIcon />, tone: 'danger' },
        { label: 'Reiniciar', cmd: 'system_restart', icon: <RefreshIcon />, tone: 'warning' },
        { label: 'Bloquear', cmd: 'system_lock', icon: <LockIcon />, tone: 'primary' },
        { label: 'Sair da sessão', cmd: 'system_sign_out', icon: <SignOutIcon />, tone: 'warning' },
        { label: 'Reiniciar Explorer', cmd: 'system_restart_explorer', icon: <RefreshIcon />, tone: 'neutral' },
        { label: 'Gerenciador de Tarefas', cmd: 'open_task_manager', icon: <TaskManagerIcon />, tone: 'primary' },
        { label: 'Fechar Barra', cmd: 'quit_app', icon: <PowerIcon />, tone: 'danger' },
    ]

    return (
        <div
            className={`power-panel${isExiting ? ' power-panel--exiting' : ''}`}
            data-theme={theme}
            style={styles}
            onMouseDown={(e) => {
                const target = e.target as HTMLElement | null
                if (!target) return
                // If the click is not on a button (or inside it), close the popup.
                if (!target.closest('.power-popup__action')) {
                    handleClose()
                }
            }}
        >
            <div className="power-popup__grid">
                {actions.map((a) => (
                    <button
                        key={a.cmd}
                        className={`power-popup__action power-popup__action--${a.tone}`}
                        onClick={() => run(a.cmd)}
                    >
                        <span className="power-popup__action-icon" aria-hidden="true">
                            {a.icon}
                        </span>
                        <span className="power-popup__action-label">{a.label}</span>
                    </button>
                ))}
            </div>

            <div className="power-panel__signature" aria-hidden="true">
                Desenvolvido por Enoque Sousa
            </div>
        </div>
    )
}
