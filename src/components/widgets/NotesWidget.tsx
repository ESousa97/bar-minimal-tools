import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TaskManagerIcon } from '../icons'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

export function NotesWidget() {
    const widgetRef = useRef<HTMLDivElement>(null)

    const handleClick = () => {
        if (!widgetRef.current) return
        const rect = widgetRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.notes.width, POPUP_SIZES.notes.height)

        window.requestAnimationFrame(() => {
            void invoke('open_notes_popup', { x, y }).catch((err) => {
                console.warn('Failed to open notes popup:', err)
            })
        })
    }

    return (
        <div
            ref={widgetRef}
            className="widget widget--inline widget--notes"
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
            title="Notas"
        >
            <div className="widget__icon">
                <TaskManagerIcon />
            </div>
            <div className="widget__content">
                <span className="widget__value">Notas</span>
            </div>
        </div>
    )
}
