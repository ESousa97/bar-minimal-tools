/**
 * Calculate the optimal position for a popup window.
 * Ensures the popup stays within screen bounds.
 */
export function calculatePopupPosition(
    rect: DOMRect,
    popupWidth: number,
    popupHeight: number
): { x: number; y: number } {
    const screenWidth = window.screen.availWidth
    const screenHeight = window.screen.availHeight
    
    // Default: center horizontally relative to the widget
    let x = Math.round(rect.left + rect.width / 2 - popupWidth / 2)
    
    // Default: position below the widget
    let y = Math.round(rect.bottom + 8)
    
    // Ensure popup doesn't go off the left edge
    if (x < 8) {
        x = 8
    }
    
    // Ensure popup doesn't go off the right edge
    if (x + popupWidth > screenWidth - 8) {
        x = screenWidth - popupWidth - 8
    }
    
    // Ensure popup doesn't go off the bottom edge
    if (y + popupHeight > screenHeight - 8) {
        // Position above the widget instead
        y = Math.round(rect.top - popupHeight - 8)
    }
    
    // Ensure popup doesn't go off the top edge
    if (y < 8) {
        y = 8
    }
    
    return { x, y }
}

// Popup sizes (match the Rust popup.rs definitions)
export const POPUP_SIZES = {
    cpu: { width: 280, height: 220 },
    ram: { width: 280, height: 220 },
    gpu: { width: 280, height: 280 },
    network: { width: 280, height: 200 },
    storage: { width: 300, height: 350 },
    audio: { width: 320, height: 400 },
    calendar: { width: 300, height: 340 },
    weather: { width: 320, height: 400 },
    notes: { width: 520, height: 420 },
    power: { width: 360, height: 360 },
    folders: { width: 240, height: 320 },
    devColor: { width: 320, height: 450 },
    taskswitcher: { width: 400, height: 500 },
} as const
