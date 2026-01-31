import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { StorageIcon } from '../icons'
import { calculatePopupPosition, POPUP_SIZES } from '../../utils/popupPosition'

interface StorageWidgetProps {
    isLoading?: boolean
}

export function StorageWidget({ isLoading }: StorageWidgetProps) {
    const buttonRef = useRef<HTMLButtonElement>(null)
    
    const handleClick = () => {
        if (!buttonRef.current) return

        const rect = buttonRef.current.getBoundingClientRect()
        const { x, y } = calculatePopupPosition(rect, POPUP_SIZES.storage.width, POPUP_SIZES.storage.height)

        window.requestAnimationFrame(() => {
            void invoke('open_storage_popup', { x, y }).catch((err) => {
                console.error('Failed to open storage popup:', err)
            })
        })
    }

    return (
        <div className={`widget widget--storage widget--icon-only ${isLoading ? 'widget--loading' : ''}`}>
            <button 
                ref={buttonRef}
                className="widget__icon-btn"
                onClick={handleClick}
                title="Ver discos"
            >
                <StorageIcon />
            </button>
        </div>
    )
}
