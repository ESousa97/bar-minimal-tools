import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Taskbar } from './components/Taskbar'
import { buildDefaultConfig } from './config/defaultConfig'
import { AppConfig, SystemSnapshot } from './types'
import { normalizeConfig } from './utils/widgets'

function App() {
  const [systemData, setSystemData] = useState<SystemSnapshot | null>(null)
  const [config, setConfig] = useState<AppConfig>(buildDefaultConfig())
  const [configLoaded, setConfigLoaded] = useState(false)
  const pollIntervalRef = useRef<number | null>(null)
  const isHeightPreviewRef = useRef(false)
  const isOpacityPreviewRef = useRef(false)
  const isBlurPreviewRef = useRef(false)

  // Load config on mount (non-blocking)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const activeConfig = await invoke<AppConfig>('get_active_profile')
        setConfig(normalizeConfig(activeConfig))
      } catch (err) {
        console.warn('Failed to load config, using defaults:', err)
      } finally {
        setConfigLoaded(true)
      }
    }
    loadConfig()
  }, [])

  // Prewarm popup windows early to eliminate first-open lag.
  useEffect(() => {
    void invoke('prewarm_popups').catch(() => {})
  }, [])

  // Listen for config changes from settings popup
  useEffect(() => {
    const unlisten = listen<AppConfig>('config-changed', (event) => {
      console.warn('Config changed event received:', event.payload)
      isHeightPreviewRef.current = false
      isOpacityPreviewRef.current = false
      isBlurPreviewRef.current = false
      setConfig(normalizeConfig(event.payload))
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  // Live preview events from Settings popup (do not persist)
  useEffect(() => {
    const unlistenPreview = listen<{ barHeight: number }>('bar-height-preview', (event) => {
      isHeightPreviewRef.current = true
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          barHeight: event.payload.barHeight,
        },
      }))
    })

    const unlistenReset = listen<{ barHeight: number }>('bar-height-preview-reset', (event) => {
      isHeightPreviewRef.current = false
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          barHeight: event.payload.barHeight,
        },
      }))
    })

    return () => {
      unlistenPreview.then(fn => fn())
      unlistenReset.then(fn => fn())
    }
  }, [])

  // Live preview events for blur toggle (do not persist)
  useEffect(() => {
    const unlistenPreview = listen<{ blur: boolean }>('blur-preview', (event) => {
      isBlurPreviewRef.current = true
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          blur: event.payload.blur,
        },
      }))
    })

    const unlistenReset = listen<{ blur: boolean }>('blur-preview-reset', (event) => {
      isBlurPreviewRef.current = false
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          blur: event.payload.blur,
        },
      }))
    })

    return () => {
      unlistenPreview.then(fn => fn())
      unlistenReset.then(fn => fn())
    }
  }, [])

  // Live preview events for opacity (do not persist)
  useEffect(() => {
    const unlistenPreview = listen<{ opacity: number }>('opacity-preview', (event) => {
      isOpacityPreviewRef.current = true
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          opacity: event.payload.opacity,
        },
      }))
    })

    const unlistenReset = listen<{ opacity: number }>('opacity-preview-reset', (event) => {
      isOpacityPreviewRef.current = false
      setConfig(prev => ({
        ...prev,
        display: {
          ...prev.display,
          opacity: event.payload.opacity,
        },
      }))
    })

    return () => {
      unlistenPreview.then(fn => fn())
      unlistenReset.then(fn => fn())
    }
  }, [])

  // Poll system data - starts immediately with default config
  useEffect(() => {
    const fetchData = async () => {
      try {
        const snapshot = await invoke<SystemSnapshot>('get_system_snapshot')
        setSystemData(snapshot)
      } catch (err) {
        console.warn('Failed to fetch system data:', err)
      }
    }

    // Initial fetch after short delay to let WMI service initialize
    const initialTimeout = setTimeout(fetchData, 500)

    // Set up polling
    pollIntervalRef.current = window.setInterval(fetchData, config.polling.intervalMs)
    
    return () => {
      clearTimeout(initialTimeout)
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [config.polling.intervalMs])

  // Apply monitor selection and window settings
  useEffect(() => {
    if (!configLoaded) return

    const applyMonitor = async () => {
      console.warn('Applying monitor settings:', config.display.targetMonitor, 'height:', config.display.barHeight)
      try {
        // While the user is dragging the height slider, we use preview_taskbar_height.
        // Avoid re-registering the AppBar on every tick.
        if (isHeightPreviewRef.current) return
        await invoke('set_taskbar_monitor', {
          monitorId: config.display.targetMonitor,
          barHeight: config.display.barHeight,
        })
        console.warn('Monitor settings applied successfully')
      } catch (err) {
        console.warn('Failed to set monitor:', err)
      }
    }
    applyMonitor()
  }, [configLoaded, config.display.targetMonitor, config.display.barHeight])

  // Dynamic styles based on config
  // More aggressive blur for a more “native glass” feel.
  const baseBlurPx = Math.max(12, Math.min(48, Math.round(config.display.barHeight * 0.75)))
  const baseRgb = config.display.theme === 'light' ? [245, 245, 250] : [15, 15, 20]
  const alpha = config.display.blur
    ? config.display.opacity
    : (config.display.opacity <= 0 ? 0 : Math.min(1, config.display.opacity + 0.05))
  // If the background is fully transparent, disable blur to avoid WebView2
  // composition edge cases where the whole bar can fail to paint.
  const blurAmountPx = config.display.blur && alpha > 0 ? baseBlurPx : 0
  const dynamicStyles: CSSProperties = {
    ['--bar-bg' as string]: `rgba(${baseRgb[0]}, ${baseRgb[1]}, ${baseRgb[2]}, ${alpha})`,
    ['--bar-height' as string]: `${config.display.barHeight}px`,
    ['--blur-amount' as string]: `${blurAmountPx}px`,
  }

  return (
    <div data-theme={config.display.theme} style={dynamicStyles}>
      <Taskbar
        systemData={systemData}
        config={config}
      />
    </div>
  )
}

export default App
