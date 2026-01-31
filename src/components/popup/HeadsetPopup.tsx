import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { HeadsetData } from '../../types'
import { HeadsetIcon, MicIcon } from '../icons'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

export function HeadsetPopup() {
    const [data, setData] = useState<HeadsetData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const { isExiting } = usePopupExit()

    const fetchData = async () => {
        try {
            const headsetData = await invoke<HeadsetData>('get_headset_data')
            setData(headsetData)
            setError(null)
        } catch (err) {
            console.error('Failed to fetch headset data:', err)
            setError(String(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 2000)
        return () => clearInterval(interval)
    }, [])

    const getBatteryClass = (percent: number) => {
        if (percent <= 15) return 'headset-battery__fill--critical'
        if (percent <= 30) return 'headset-battery__fill--low'
        if (percent <= 50) return 'headset-battery__fill--medium'
        if (percent <= 80) return 'headset-battery__fill--good'
        return 'headset-battery__fill--full'
    }

    return (
        <div className={`popup-container popup-container--headset${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Headset</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : error ? (
                <div className="popup-error">{error}</div>
            ) : !data?.sdk_available ? (
                <div className="popup-empty">
                    <p>SDK do iCUE não disponível</p>
                    <p className="popup-empty__hint">
                        Instale o iCUE da Corsair para usar este recurso
                    </p>
                </div>
            ) : data.status === 'Disconnected' || !data.device_id ? (
                <div className="popup-empty">
                    <HeadsetIcon status="disconnected" />
                    <p>Nenhum headset conectado</p>
                    <p className="popup-empty__hint">
                        Conecte seu headset Corsair
                    </p>
                </div>
            ) : (
                <div className="popup-content">
                    {/* Device Info */}
                    <div className="headset-info">
                        <div className="headset-info__icon">
                            <HeadsetIcon 
                                status={data.is_charging ? 'charging' : 'connected'} 
                                batteryLevel={data.battery_percent}
                            />
                        </div>
                        <div className="headset-info__details">
                            <div className="headset-info__name">{data.name}</div>
                            <div className="headset-info__status">
                                {data.is_charging ? 'Carregando' : 'Conectado'}
                            </div>
                        </div>
                    </div>

                    {/* Battery */}
                    {data.supported_features.has_battery && (
                        <div className="headset-section">
                            <div className="headset-section__title">Bateria</div>
                            <div className="headset-battery">
                                <div className="headset-battery__bar">
                                    <div 
                                        className={`headset-battery__fill ${getBatteryClass(data.battery_percent)}`}
                                        style={{ width: `${data.battery_percent}%` }}
                                    />
                                </div>
                                <span className="headset-battery__value">
                                    {data.battery_percent}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Mic Status (read-only) */}
                    <div className="headset-section">
                        <div className="headset-section__title">Microfone</div>
                        <div className={`headset-mic-status ${data.mic_enabled ? 'headset-mic-status--active' : ''}`}>
                            <MicIcon muted={!data.mic_enabled} />
                            <span className="headset-mic-status__text">
                                {data.mic_enabled ? 'Ativado' : 'Desativado'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default HeadsetPopup
