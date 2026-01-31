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
    const lines = buildTooltipLines(headsetData, sdkStatus)
    return lines.join('\n')
}

function buildTooltipLines(
    data: HeadsetData,
    sdkStatus: IcueSdkStatus | null
): string[] {
    const lines: string[] = []

    lines.push(formatNameLine(data))
    lines.push(formatBatteryLine(data))
    lines.push(formatMicLine(data))
    lines.push(formatSurroundLine(data))
    lines.push(formatSidetoneLine(data))
    lines.push(formatEqLine(data))
    lines.push(formatLightingLine(data))

    if (!sdkStatus?.icue_running) {
        lines.push('[!] iCUE não está rodando')
    }

    lines.push('')
    lines.push('Clique para mais opções')

    return lines
}

function formatNameLine(data: HeadsetData): string {
    const name = data.name || 'Headset'
    const status = data.status ?? 'Disconnected'
    const isCharging = data.is_charging ?? false
    return `${name}\n${status}${isCharging ? ' (Charging)' : ''}`
}

function formatBatteryLine(data: HeadsetData): string {
    const battery = data.battery_percent ?? 0
    return `Bateria: ${battery}%`
}

function formatMicLine(data: HeadsetData): string {
    const micEnabled = data.mic_enabled ?? false
    return `Mic: ${micEnabled ? 'On' : 'Off'}`
}

function formatSurroundLine(data: HeadsetData): string {
    const surroundEnabled = data.surround_sound_enabled ?? false
    return `7.1: ${surroundEnabled ? 'On' : 'Off'}`
}

function formatSidetoneLine(data: HeadsetData): string {
    const sidetoneEnabled = data.sidetone_enabled ?? false
    return `Sidetone: ${sidetoneEnabled ? 'On' : 'Off'}`
}

function formatEqLine(data: HeadsetData): string {
    const eqPreset = data.equalizer_preset
    return `EQ: ${typeof eqPreset === 'number' ? eqPreset : '-'}`
}

function formatLightingLine(data: HeadsetData): string {
    const ledCount = data.led_count ?? 0
    const hasLighting = data.supported_features?.has_lighting ?? (ledCount > 0)
    return `RGB/LEDs: ${hasLighting ? `Sim (${ledCount})` : 'Não'}`
}
