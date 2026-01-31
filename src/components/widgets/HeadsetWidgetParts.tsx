import type { RefObject } from 'react'
import { HeadsetData, IcueSdkStatus } from '../../types'
import { HeadsetIcon, MicIcon } from '../icons'
import { buildTooltip, getDisplayText, getIconStatus, getStatusClass } from './headsetHelpers'

// Sub-components
interface SdkNotInstalledWidgetProps {
    widgetRef: RefObject<HTMLDivElement | null>
    isInstalling: boolean
    onClick: () => void
}

export function SdkNotInstalledWidget({ widgetRef, isInstalling, onClick }: SdkNotInstalledWidgetProps) {
    return (
        <div
            ref={widgetRef}
            className="widget widget--inline widget--headset widget--headset-no-sdk"
            title="iCUE SDK não instalado\nClique para instalar"
            onClick={onClick}
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

interface ConnectedHeadsetWidgetProps {
    widgetRef: RefObject<HTMLDivElement | null>
    headsetData: HeadsetData
    sdkStatus: IcueSdkStatus | null
    isLoading?: boolean
    onClick: () => void
}

export function ConnectedHeadsetWidget({
    widgetRef,
    headsetData,
    sdkStatus,
    isLoading,
    onClick,
}: ConnectedHeadsetWidgetProps) {
    const battery = headsetData.battery_percent ?? 0
    const status = headsetData.status ?? 'Disconnected'
    const isCharging = headsetData.is_charging ?? false
    const micEnabled = headsetData.mic_enabled ?? false

    const iconStatus = getIconStatus(isCharging, status)
    const displayText = getDisplayText(status, isCharging, battery)
    const statusClass = getStatusClass(status, isCharging, battery)
    const tooltip = buildTooltip(headsetData, sdkStatus)

    return (
        <div
            ref={widgetRef}
            className={`widget widget--inline widget--headset ${statusClass}`}
            title={tooltip}
            onClick={onClick}
            style={{ cursor: 'pointer' }}
        >
            <div className="widget__icon">
                {isLoading ? (
                    <div className="widget__skeleton" />
                ) : (
                    <HeadsetIcon status={iconStatus} batteryLevel={battery} />
                )}
            </div>
            <span className="widget__value">
                {isLoading ? '--' : displayText}
            </span>
            {status === 'Connected' && headsetData.supported_features.has_mic_toggle && (
                <div className="widget__mic-indicator" title={micEnabled ? 'Mic On' : 'Mic Muted'}>
                    <MicIcon muted={!micEnabled} />
                </div>
            )}
        </div>
    )
}
