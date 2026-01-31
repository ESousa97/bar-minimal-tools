import { invoke } from '@tauri-apps/api/core'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { HeadsetData, IcueSdkStatus } from '../../types'
import { BoltIcon, HeadsetIcon, MicIcon } from '../icons'

interface HeadsetWidgetProps {
    isLoading?: boolean
    /** Always show the widget even if SDK is not available */
    alwaysShow?: boolean
}

export function HeadsetWidget({ isLoading, alwaysShow = false }: HeadsetWidgetProps) {
    const [headsetData, setHeadsetData] = useState<HeadsetData | null>(null)
    const [sdkStatus, setSdkStatus] = useState<IcueSdkStatus | null>(null)
    const [isInstalling, setIsInstalling] = useState(false)
    const widgetRef = useRef<HTMLDivElement>(null)
    
    // Check SDK status on mount
    useEffect(() => {
        const checkSdk = async () => {
            try {
                const status = await invoke<IcueSdkStatus>('check_icue_sdk')
                setSdkStatus(status)
            } catch (err) {
                console.error('Failed to check iCUE SDK:', err)
            }
        }
        checkSdk()
    }, [])
    
    // Fetch headset data periodically
    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await invoke<HeadsetData>('get_headset_data')
                setHeadsetData(data)
            } catch (err) {
                console.error('Failed to fetch headset data:', err)
            }
        }
        
        fetchData()
        // Poll every 5 seconds (battery doesn't change that fast)
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])
    
    // Handle click to open popup or install SDK
    const handleClick = async () => {
        if (!sdkStatus?.installed && !isInstalling) {
            // Install SDK
            setIsInstalling(true)
            try {
                const result = await invoke<string>('install_icue_sdk')
                console.warn('Install result:', result)
                // Re-check SDK after a delay
                setTimeout(async () => {
                    const status = await invoke<IcueSdkStatus>('check_icue_sdk')
                    setSdkStatus(status)
                    setIsInstalling(false)
                }, 2000)
            } catch (err) {
                console.error('Failed to install iCUE SDK:', err)
                setIsInstalling(false)
            }
        } else if (widgetRef.current) {
            // Open popup - centered below the widget
            const rect = widgetRef.current.getBoundingClientRect()
            const popupWidth = 340 // Match popup.rs width
            const x = Math.round(rect.left + rect.width / 2 - popupWidth / 2)
            const y = Math.round(rect.bottom + 4) // 4px gap below the widget

            window.requestAnimationFrame(() => {
                void invoke('open_headset_popup', { x, y }).catch((err) => {
                    console.error('Failed to open headset popup:', err)
                })
            })
        }
    }
    
    // Hide widget if SDK not available and not always showing
    if (!alwaysShow && !sdkStatus?.installed && !isLoading) {
        return null
    }
    
    // Show SDK not installed state
    if (!sdkStatus?.installed) {
        return (
            <div 
                ref={widgetRef}
                className="widget widget--inline widget--headset widget--headset-no-sdk"
                title="iCUE SDK não instalado\nClique para instalar"
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
            >
                <div className="widget__icon">
                    <HeadsetIcon status="disconnected" batteryLevel={0} />
                </div>
                <span className="widget__value">
                    {isInstalling ? '...' : 'SDK'}
                </span>
            </div>
        )
    }
    
    const battery = headsetData?.battery_percent ?? 0
    const status = headsetData?.status ?? 'Disconnected'
    const isCharging = headsetData?.is_charging ?? false
    const name = headsetData?.name || 'Headset'
    const micEnabled = headsetData?.mic_enabled ?? false
    const eqPreset = headsetData?.equalizer_preset
    const surroundEnabled = headsetData?.surround_sound_enabled ?? false
    const sidetoneEnabled = headsetData?.sidetone_enabled ?? false
    const ledCount = headsetData?.led_count ?? 0
    const hasLighting = headsetData?.supported_features?.has_lighting ?? (ledCount > 0)
    
    // Map status to icon status
    const getIconStatus = (): 'connected' | 'disconnected' | 'charging' => {
        if (isCharging || status === 'Charging') return 'charging'
        if (status === 'Connected') return 'connected'
        return 'disconnected'
    }
    
    // Get display text
    const getDisplayText = (): ReactNode => {
        if (status === 'Disconnected') return 'Off'
        if (isCharging) return <>{battery}%<span className="widget__charging-icon"><BoltIcon /></span></>
        return `${battery}%`
    }
    
    // Get status color class
    const getStatusClass = (): string => {
        if (status === 'Disconnected') return 'widget--headset-off'
        if (isCharging) return 'widget--headset-charging'
        if (battery <= 20) return 'widget--headset-low'
        return ''
    }

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--inline widget--headset ${getStatusClass()}`}
            title={`${name}\n${status}${isCharging ? ' (Charging)' : ''}\nBateria: ${battery}%\nMic: ${micEnabled ? 'On' : 'Off'}\n7.1: ${surroundEnabled ? 'On' : 'Off'}\nSidetone: ${sidetoneEnabled ? 'On' : 'Off'}\nEQ: ${typeof eqPreset === 'number' ? eqPreset : '-'}\nRGB/LEDs: ${hasLighting ? `Sim (${ledCount})` : 'Não'}${sdkStatus?.icue_running ? '' : '\n[!] iCUE não está rodando'}\n\nClique para mais opções`}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                {isLoading ? (
                    <div className="widget__skeleton" />
                ) : (
                    <HeadsetIcon status={getIconStatus()} batteryLevel={battery} />
                )}
            </div>
            <span className="widget__value">
                {isLoading ? '--' : getDisplayText()}
            </span>
            {/* Mic indicator when connected */}
            {status === 'Connected' && headsetData?.supported_features.has_mic_toggle && (
                <div className="widget__mic-indicator" title={micEnabled ? 'Mic On' : 'Mic Muted'}>
                    <MicIcon muted={!micEnabled} />
                </div>
            )}
        </div>
    )
}
