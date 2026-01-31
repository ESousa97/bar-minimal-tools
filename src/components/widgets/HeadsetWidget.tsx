import { invoke } from '@tauri-apps/api/core'
import { useRef } from 'react'
import { HeadsetData } from '../../types'
import { ConnectedHeadsetWidget, SdkNotInstalledWidget } from './HeadsetWidgetParts'
import { useHeadsetData, useHeadsetSdk } from './useHeadset'

interface HeadsetWidgetProps {
    isLoading?: boolean
    /** Always show the widget even if SDK is not available */
    alwaysShow?: boolean
}

export function HeadsetWidget({ isLoading, alwaysShow = false }: HeadsetWidgetProps) {
    const widgetRef = useRef<HTMLDivElement>(null)
    const { sdkStatus, isInstalling, installSdk } = useHeadsetSdk()
    const { headsetData } = useHeadsetData()

    const openPopup = () => {
        if (!widgetRef.current) return
        const rect = widgetRef.current.getBoundingClientRect()
        const popupWidth = 340
        const x = Math.round(rect.left + rect.width / 2 - popupWidth / 2)
        const y = Math.round(rect.bottom + 4)

        window.requestAnimationFrame(() => {
            void invoke('open_headset_popup', { x, y }).catch((err) => {
                console.error('Failed to open headset popup:', err)
            })
        })
    }

    const handleClick = async () => {
        if (!sdkStatus?.installed && !isInstalling) {
            await installSdk()
        } else {
            openPopup()
        }
    }

    // Hide widget if SDK not available and not always showing
    if (!alwaysShow && !sdkStatus?.installed && !isLoading) {
        return null
    }

    // Show SDK not installed state
    if (!sdkStatus?.installed) {
        return (
            <SdkNotInstalledWidget
                widgetRef={widgetRef}
                isInstalling={isInstalling}
                onClick={handleClick}
            />
        )
    }

    // Show connected headset widget
    const defaultHeadsetData: HeadsetData = {
        battery_percent: 0,
        status: 'Disconnected',
        is_charging: false,
        name: 'Headset',
        device_id: '',
        sdk_available: false,
        mic_enabled: false,
        surround_sound_enabled: false,
        sidetone_enabled: false,
        equalizer_preset: 1,
        led_count: 0,
        supported_features: {
            has_battery: false,
            has_mic_toggle: false,
            has_surround_sound: false,
            has_sidetone: false,
            has_equalizer: false,
            has_lighting: false,
        },
    }

    return (
        <ConnectedHeadsetWidget
            widgetRef={widgetRef}
            headsetData={headsetData ?? defaultHeadsetData}
            sdkStatus={sdkStatus}
            isLoading={isLoading}
            onClick={handleClick}
        />
    )
}
