import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import '../../index.css'
import { CpuData } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'

export function CpuPopup() {
    const [data, setData] = useState<CpuData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const cpuData = await invoke<CpuData>('get_cpu_data')
                setData(cpuData)
            } catch (err) {
                console.error('Failed to fetch CPU data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 2000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className={`popup-container popup-container--cpu${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">CPU</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : !data ? (
                <div className="popup-empty">Dados indisponíveis</div>
            ) : (
                <div className="popup-content">
                    <div className="popup-item">
                        <span className="popup-item__name">{data.name}</span>
                    </div>

                    <div className="popup-row">
                        <span className="popup-row__label">Uso</span>
                        <span className="popup-row__value popup-row__value--cpu">{data.total_usage.toFixed(0)}%</span>
                    </div>

                    <div className="popup-row">
                        <span className="popup-row__label">Cores Lógicos</span>
                        <span className="popup-row__value">{data.logical_cores}</span>
                    </div>

                    {data.clock_mhz && (
                        <div className="popup-row">
                            <span className="popup-row__label">Clock</span>
                            <span className="popup-row__value">{data.clock_mhz} MHz</span>
                        </div>
                    )}

                    {data.name.toLowerCase().includes('intel') && (
                        <div className="cpu-brand-logo">
                            <img src="/inteli5.svg" alt="Intel" />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CpuPopup
