import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { NetworkData } from '../../types'
import { ArrowDownIcon, ArrowUpIcon } from '../icons'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

export function NetworkPopup() {
    const [data, setData] = useState<NetworkData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const networkData = await invoke<NetworkData>('get_network_data')
                setData(networkData)
            } catch (err) {
                console.error('Failed to fetch Network data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 1000)
        return () => clearInterval(interval)
    }, [])

    const formatSpeed = (bytesPerSec: number): string => {
        const mbps = (bytesPerSec * 8) / 1_000_000
        if (mbps >= 1000) {
            return `${(mbps / 1000).toFixed(2)} Gbps`
        } else if (mbps >= 1) {
            return `${mbps.toFixed(2)} Mbps`
        } else {
            const kbps = mbps * 1000
            return `${kbps.toFixed(0)} Kbps`
        }
    }

    return (
        <div className={`popup-container popup-container--network${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Rede</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : !data ? (
                <div className="popup-empty">Dados indisponíveis</div>
            ) : (
                <div className="popup-content">
                    <div className="popup-item">
                        <span className="popup-item__name">{data.interface_name}</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">Status</span>
                        <span className={`popup-row__value ${data.is_connected ? 'popup-row__value--network' : ''}`}>
                            {data.is_connected ? 'Conectado' : 'Desconectado'}
                        </span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label"><span className="popup-row__icon"><ArrowDownIcon /></span> Download</span>
                        <span className="popup-row__value popup-row__value--network">
                            {formatSpeed(data.download_bytes_sec)}
                        </span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label"><span className="popup-row__icon"><ArrowUpIcon /></span> Upload</span>
                        <span className="popup-row__value popup-row__value--upload">
                            {formatSpeed(data.upload_bytes_sec)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default NetworkPopup
