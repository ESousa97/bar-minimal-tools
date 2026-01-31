import { useState, useCallback, useRef, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

const EXIT_ANIMATION_DURATION = 150 // ms - matches CSS animation duration

/**
 * Hook to handle popup close with smooth exit animation.
 * Returns:
 * - isExiting: boolean to apply exit animation class
 * - handleClose: function to trigger animated close
 * - triggerExit: function to trigger exit animation without auto-closing (for custom handlers)
 */
export function usePopupExit(options?: { 
    autoCloseOnBlur?: boolean; 
    closeAction?: () => Promise<void>;
    onCloseStart?: () => void;
}) {
    const { autoCloseOnBlur = true, closeAction, onCloseStart } = options ?? {}
    const [isExiting, setIsExiting] = useState(false)
    const isClosingRef = useRef(false)

    const resetExit = useCallback(() => {
        isClosingRef.current = false
        setIsExiting(false)
    }, [])

    const triggerExit = useCallback(async (): Promise<void> => {
        // Trigger exit animation
        setIsExiting(true)

        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, EXIT_ANIMATION_DURATION))
    }, [])

    const handleClose = useCallback(async () => {
        // Prevent multiple close attempts
        if (isClosingRef.current) return
        isClosingRef.current = true

        if (onCloseStart) {
            onCloseStart()
        }

        try {
            await triggerExit()
            // Hide the window (keep it alive to make next open instant)
            if (closeAction) {
                await closeAction()
            } else {
                await getCurrentWindow().hide()
            }
        } catch (err) {
            console.error('Failed to hide popup:', err)
        } finally {
            // Important: popups are hidden (not destroyed). Without resetting, the next
            // open can remain stuck in the "--exiting" CSS state.
            resetExit()
        }
    }, [triggerExit, resetExit, closeAction, onCloseStart])

    // Listen for window blur (focus loss) to auto-close
    useEffect(() => {
        if (!autoCloseOnBlur) return

        const currentWindow = getCurrentWindow()

        const unlistenPromise = currentWindow.onFocusChanged(({ payload: focused }) => {
            if (!focused && !isClosingRef.current) {
                handleClose()
            }
        })

        return () => {
            unlistenPromise.then(unlisten => unlisten())
        }
    }, [handleClose, autoCloseOnBlur])

    return { isExiting, handleClose, triggerExit, resetExit }
}

export default usePopupExit
