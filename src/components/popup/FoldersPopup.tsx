import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FolderShortcut, FolderShortcutsConfig } from '../../types'
import { getFolderIconByName } from '../icons'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

export default function FoldersPopup() {
    // Force remove any margins/padding on the window body
    useEffect(() => {
        document.body.style.margin = '0'
        document.body.style.padding = '0'
        document.documentElement.style.margin = '0'
        document.documentElement.style.padding = '0'
    }, [])
    const [shortcuts, setShortcuts] = useState<FolderShortcut[]>([])
    const { isExiting, handleClose } = usePopupExit({
        onCloseStart: () => {
            // Prevent the close->reopen race while exit animation runs.
            invoke('set_folders_popup_cooldown', { durationMs: 250 }).catch(() => {})
        },
    })

    // Load data on mount
    useEffect(() => {
        const load = async () => {
            try {
                const foldersConfig = await invoke<FolderShortcutsConfig>('get_folder_shortcuts')
                setShortcuts(foldersConfig.shortcuts.filter(s => s.enabled))
            } catch {
                // ignore
            }
        }
        load()
    }, [])

    const openFolder = (path: string) => {
        invoke('open_folder', { path }).catch(console.warn)
        handleClose()
    }

    return (
        <div className={`folders-menu${isExiting ? ' folders-menu--exiting' : ''}`}>
            <div className="folders-menu__header">
                <span className="folders-menu__title">Acesso Rápido</span>
            </div>
            <div className="folders-menu__content">
                {shortcuts.map((shortcut) => (
                    <button
                        key={shortcut.id}
                        className="folders-menu__item"
                        onClick={() => openFolder(shortcut.path)}
                        title={shortcut.path}
                    >
                        <span className="folders-menu__item-icon">
                            {getFolderIconByName(shortcut.icon)}
                        </span>
                        <span className="folders-menu__item-name">{shortcut.name}</span>
                    </button>
                ))}
                {shortcuts.length === 0 && (
                    <div className="folders-menu__empty">
                        Nenhum atalho configurado
                    </div>
                )}
            </div>
            <div className="folders-menu__signature" aria-hidden="true">
                Desenvolvido por Enoque Sousa
            </div>
        </div>
    )
}
