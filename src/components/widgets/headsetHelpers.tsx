import type { ReactNode } from 'react'
import { HeadsetData, IcueSdkStatus } from '../../types'
import { BoltIcon } from '../icons'

export function getIconStatus(
    isCharging: boolean,
    status: string
): 'connected' | 'disconnected' | 'charging' {
    if (isCharging || status === 'Charging') return 'charging'
    if (status === 'Connected') return 'connected'
    return 'disconnected'
}

export function getDisplayText(
    status: string,
    isCharging: boolean,
    battery: number
): ReactNode {
    if (status === 'Disconnected') return 'Off'
    if (isCharging) {
        return (
            <>
                {battery}%<span className="widget__charging-icon"><BoltIcon /></span>
            </>
        )
    }
    return `${battery}%`
}

export function getStatusClass(
    status: string,
    isCharging: boolean,
    battery: number
): string {
    if (status === 'Disconnected') return 'widget--headset-off'
    if (isCharging) return 'widget--headset-charging'
    if (battery <= 20) return 'widget--headset-low'
    return ''
}

export function buildTooltip(
    headsetData: HeadsetData,
    sdkStatus: IcueSdkStatus | null
): string {
    const name = headsetData.name || 'Headset'
    const status = headsetData.status ?? 'Disconnected'
    const isCharging = headsetData.is_charging ?? false
    const battery = headsetData.battery_percent ?? 0
    const micEnabled = headsetData.mic_enabled ?? false
    const eqPreset = headsetData.equalizer_preset
    const surroundEnabled = headsetData.surround_sound_enabled ?? false
    const sidetoneEnabled = headsetData.sidetone_enabled ?? false
    const ledCount = headsetData.led_count ?? 0
    const hasLighting = headsetData.supported_features?.has_lighting ?? (ledCount > 0)

    return `${name}\n${status}${isCharging ? ' (Charging)' : ''}\nBateria: ${battery}%\nMic: ${micEnabled ? 'On' : 'Off'}\n7.1: ${surroundEnabled ? 'On' : 'Off'}\nSidetone: ${sidetoneEnabled ? 'On' : 'Off'}\nEQ: ${typeof eqPreset === 'number' ? eqPreset : '-'}\nRGB/LEDs: ${hasLighting ? `Sim (${ledCount})` : 'Não'}${sdkStatus?.icue_running ? '' : '\n[!] iCUE não está rodando'}\n\nClique para mais opções`
}
