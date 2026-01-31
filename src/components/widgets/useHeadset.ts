import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import { HeadsetData, IcueSdkStatus } from '../../types'

interface UseHeadsetSdkReturn {
    sdkStatus: IcueSdkStatus | null
    isInstalling: boolean
    installSdk: () => Promise<void>
}

export function useHeadsetSdk(): UseHeadsetSdkReturn {
    const [sdkStatus, setSdkStatus] = useState<IcueSdkStatus | null>(null)
    const [isInstalling, setIsInstalling] = useState(false)

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

    const installSdk = useCallback(async () => {
        if (isInstalling) return
        setIsInstalling(true)
        try {
            const result = await invoke<string>('install_icue_sdk')
            console.warn('Install result:', result)
            setTimeout(async () => {
                const status = await invoke<IcueSdkStatus>('check_icue_sdk')
                setSdkStatus(status)
                setIsInstalling(false)
            }, 2000)
        } catch (err) {
            console.error('Failed to install iCUE SDK:', err)
            setIsInstalling(false)
        }
    }, [isInstalling])

    return { sdkStatus, isInstalling, installSdk }
}

interface UseHeadsetDataReturn {
    headsetData: HeadsetData | null
}

export function useHeadsetData(): UseHeadsetDataReturn {
    const [headsetData, setHeadsetData] = useState<HeadsetData | null>(null)

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
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])

    return { headsetData }
}
