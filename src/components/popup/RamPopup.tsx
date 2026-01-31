import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RamData } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)} GB`
}

export function RamPopup() {
    const [data, setData] = useState<RamData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const ramData = await invoke<RamData>('get_ram_data')
                setData(ramData)
            } catch (err) {
                console.error('Failed to fetch RAM data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 2000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className={`popup-container popup-container--ram${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Memória RAM</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : !data ? (
                <div className="popup-empty">Dados indisponíveis</div>
            ) : (
                <div className="popup-content">
                    <div className="popup-row">
                        <span className="popup-row__label">Uso</span>
                        <span className="popup-row__value popup-row__value--ram">{data.usage_percent.toFixed(0)}%</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">Usado</span>
                        <span className="popup-row__value">{formatBytes(data.used_bytes)}</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">Disponível</span>
                        <span className="popup-row__value">{formatBytes(data.available_bytes)}</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">Total</span>
                        <span className="popup-row__value">{formatBytes(data.total_bytes)}</span>
                    </div>
                    
                    {data.speed_mhz && (
                        <div className="popup-row">
                            <span className="popup-row__label">Velocidade</span>
                            <span className="popup-row__value popup-row__value--ram">{data.speed_mhz} MHz</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default RamPopup
