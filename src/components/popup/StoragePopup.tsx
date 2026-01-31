import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { StorageData, DriveInfo } from '../../types'
import { ThermometerIcon } from '../icons'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1000) {
        return `${(gb / 1024).toFixed(1)}TB`
    }
    return `${gb.toFixed(0)}GB`
}

export function StoragePopup() {
    const [data, setData] = useState<StorageData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const storageData = await invoke<StorageData>('get_storage_data')
                setData(storageData)
            } catch (err) {
                console.error('Failed to fetch storage data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [])

    const drives = data?.drives ?? []

    return (
        <div className={`popup-container${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Armazenamento</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : drives.length === 0 ? (
                <div className="popup-empty">Nenhum disco detectado</div>
            ) : (
                <div className="popup-content">
                    {drives.map((drive: DriveInfo) => {
                        const usagePercent = drive.usage_percent ?? 0
                        const usedBytes = drive.used_bytes ?? 0
                        const totalBytes = drive.total_bytes ?? 0
                        const freeBytes = drive.free_bytes ?? 0

                        return (
                            <div key={drive.letter} className="storage-drive">
                                <div className="storage-drive__header">
                                    <span className="storage-drive__letter">{drive.letter}</span>
                                    <span className="storage-drive__label">{drive.label || 'Disco Local'}</span>
                                    <span className="storage-drive__usage">{usagePercent.toFixed(0)}%</span>
                                </div>

                                <div className="storage-drive__progress">
                                    <div
                                        className={`storage-drive__bar ${usagePercent > 90 ? 'storage-drive__bar--critical' : usagePercent > 75 ? 'storage-drive__bar--warning' : ''}`}
                                        style={{ width: `${Math.min(100, usagePercent)}%` }}
                                    />
                                </div>

                                <div className="storage-drive__details">
                                    <span className="storage-drive__used">
                                        {formatBytes(usedBytes)} usado
                                    </span>
                                    <span className="storage-drive__free">
                                        {formatBytes(freeBytes)} livre
                                    </span>
                                    <span className="storage-drive__total">
                                        {formatBytes(totalBytes)} total
                                    </span>
                                </div>

                                {drive.temperature_c !== null && drive.temperature_c !== undefined && (
                                    <div className="storage-drive__stats">
                                        <span className="storage-drive__temp">
                                            <span className="storage-drive__temp-icon"><ThermometerIcon /></span> {drive.temperature_c.toFixed(0)}°C
                                        </span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default StoragePopup
