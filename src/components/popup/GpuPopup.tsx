import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import '../../index.css'
import { GpuData } from '../../types'
import { usePopupExit } from '../../utils/usePopupExit'

export function GpuPopup() {
    const [data, setData] = useState<GpuData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    useEffect(() => {
        const fetchData = async () => {
            try {
                const gpuData = await invoke<GpuData>('get_gpu_data')
                setData(gpuData)
            } catch (err) {
                console.error('Failed to fetch GPU data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 2000)
        return () => clearInterval(interval)
    }, [])

    const detailed = data?.type === 'Detailed' ? data : null
    const isNvidia = !!detailed

    return (
        <div className={`popup-container popup-container--gpu${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">GPU</span>
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
                        <span className="popup-row__label">Fabricante</span>
                        <span className="popup-row__value">{data.vendor}</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">Uso</span>
                        <span className="popup-row__value popup-row__value--gpu">{data.usage_percent.toFixed(0)}%</span>
                    </div>
                    
                    {isNvidia && detailed?.temperature_c && (
                        <div className="popup-row">
                            <span className="popup-row__label">Temperatura</span>
                            <span className="popup-row__value popup-row__value--gpu">{detailed.temperature_c.toFixed(0)}°C</span>
                        </div>
                    )}
                    
                    {isNvidia && detailed?.power_draw_w && (
                        <div className="popup-row">
                            <span className="popup-row__label">Consumo</span>
                            <span className="popup-row__value">{detailed.power_draw_w.toFixed(0)}W</span>
                        </div>
                    )}
                    
                    <div className="popup-row">
                        <span className="popup-row__label">VRAM Usado</span>
                        <span className="popup-row__value">{(data.vram_used_mb / 1024).toFixed(1)} GB</span>
                    </div>
                    
                    <div className="popup-row">
                        <span className="popup-row__label">VRAM Total</span>
                        <span className="popup-row__value">{(data.vram_total_mb / 1024).toFixed(1)} GB</span>
                    </div>
                    
                    {isNvidia && (
                        <div className="gpu-brand-logo">
                            <img src="/logortxnvidia.svg" alt="NVIDIA" />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default GpuPopup
