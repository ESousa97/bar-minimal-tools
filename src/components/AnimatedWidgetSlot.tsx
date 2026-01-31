import { useEffect, useRef, useState, type ReactNode } from 'react'

interface AnimatedWidgetSlotProps {
  enabled: boolean
  className?: string
  durationMs?: number
  children: ReactNode
}

export function AnimatedWidgetSlot({
  enabled,
  className,
  durationMs = 180,
  children,
}: AnimatedWidgetSlotProps) {
  const [mounted, setMounted] = useState(enabled)
  const [visualEnabled, setVisualEnabled] = useState(enabled)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (enabled) {
      // Mount collapsed, then expand next frame so CSS transition runs.
      setMounted(true)
      setVisualEnabled(false)
      const raf = requestAnimationFrame(() => setVisualEnabled(true))
      return () => cancelAnimationFrame(raf)
    }

    // Collapse immediately, then unmount after transition.
    setVisualEnabled(false)
    timeoutRef.current = window.setTimeout(() => {
      setMounted(false)
      timeoutRef.current = null
    }, durationMs)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [enabled, durationMs])

  if (!mounted) return null

  return (
    <div
      className={[
        'widget-slot',
        visualEnabled ? 'widget-slot--on' : 'widget-slot--off',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
