import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { AudioData, AudioDevice } from '../../types'
import { VolumeIcon, MicIcon } from '../icons'
import { usePopupExit } from '../../utils/usePopupExit'
import '../../index.css'

export function AudioPopup() {
    const [data, setData] = useState<AudioData | null>(null)
    const [loading, setLoading] = useState(true)
    const { isExiting } = usePopupExit()

    const fetchData = async () => {
        try {
            const audioData = await invoke<AudioData>('get_audio_data')
            setData(audioData)
        } catch (err) {
            console.error('Failed to fetch audio data:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 1000)
        return () => clearInterval(interval)
    }, [])

    const handleSelectDefaultDevice = async (deviceId: string) => {
        if (!data) return

        // Optimistic UI update (instant feedback)
        const next: AudioData = {
            ...data,
            default_output_id: deviceId,
            output_devices: data.output_devices.map(d => ({ ...d, is_default: d.id === deviceId })),
        }
        setData(next)

        try {
            await invoke('set_default_audio_device', { deviceId })
            fetchData()
        } catch (err) {
            console.error('Failed to set default audio device:', err)
            // Re-sync on failure
            fetchData()
        }
    }

    const handleSelectDefaultInputDevice = async (deviceId: string) => {
        if (!data) return

        const next: AudioData = {
            ...data,
            default_input_id: deviceId,
            input_devices: data.input_devices.map(d => ({ ...d, is_default: d.id === deviceId })),
        }
        setData(next)

        try {
            await invoke('set_default_audio_device', { deviceId })
            fetchData()
        } catch (err) {
            console.error('Failed to set default input device:', err)
            fetchData()
        }
    }

    const handleVolumeChange = async (deviceId: string, volume: number) => {
        try {
            await invoke('set_device_volume', { deviceId, volume: Math.round(volume) })
            fetchData()
        } catch (err) {
            console.error('Failed to set volume:', err)
        }
    }

    const handleMasterVolumeChange = async (volume: number) => {
        try {
            await invoke('set_master_volume', { volume: Math.round(volume) })
            fetchData()
        } catch (err) {
            console.error('Failed to set master volume:', err)
        }
    }

    const handleToggleMute = async () => {
        try {
            await invoke('toggle_mute')
            fetchData()
        } catch (err) {
            console.error('Failed to toggle mute:', err)
        }
    }

    const renderDeviceItem = (device: AudioDevice, isOutput: boolean) => (
        <div 
            key={device.id} 
            className={`audio-device audio-device--selectable ${device.is_default ? 'audio-device--default' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => (isOutput ? handleSelectDefaultDevice(device.id) : handleSelectDefaultInputDevice(device.id))}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (isOutput) {
                        handleSelectDefaultDevice(device.id)
                    } else {
                        handleSelectDefaultInputDevice(device.id)
                    }
                }
            }}
        >
            <div className="audio-device__header">
                <div className="audio-device__icon">
                    {isOutput ? (
                        <VolumeIcon muted={device.is_muted} level={device.volume} />
                    ) : (
                        <MicIcon muted={device.is_muted} />
                    )}
                </div>
                <div className="audio-device__name" title={device.name}>
                    {device.name}
                </div>
                {device.is_default && (
                    <span className="audio-device__badge">Padrão</span>
                )}
                <span
                    className={`audio-device__selector${device.is_default ? ' audio-device__selector--on' : ''}`}
                    aria-hidden="true"
                />
            </div>
            <div className="audio-device__volume">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={device.volume}
                    onChange={(e) => handleVolumeChange(device.id, parseFloat(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="audio-slider"
                />
                <span className="audio-device__volume-value">{device.volume}%</span>
            </div>
        </div>
    )

    return (
        <div className={`popup-container popup-container--audio${isExiting ? ' popup-container--exiting' : ''}`}>
            <div className="popup-header">
                <span className="popup-title">Áudio</span>
            </div>

            {loading ? (
                <div className="popup-loading">Carregando...</div>
            ) : !data ? (
                <div className="popup-empty">Dados indisponíveis</div>
            ) : (
                <div className="popup-content">
                    {/* Master Volume Control */}
                    <div className="audio-master">
                        <div className="audio-master__header">
                            <button 
                                className="audio-master__mute-btn"
                                onClick={handleToggleMute}
                                title={data.is_muted ? 'Ativar som' : 'Silenciar'}
                            >
                                <VolumeIcon muted={data.is_muted} level={data.master_volume} />
                            </button>
                            <span className="audio-master__label">Volume Principal</span>
                        </div>
                        <div className="audio-master__control">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={data.master_volume}
                                onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
                                className="audio-slider audio-slider--master"
                            />
                            <span className="audio-master__value">{data.master_volume}%</span>
                        </div>
                    </div>

                    {/* Output Devices */}
                    {data.output_devices.length > 0 && (
                        <div className="audio-section">
                            <div className="audio-section__title">Saída de Áudio</div>
                            {data.output_devices.map(device => renderDeviceItem(device, true))}
                        </div>
                    )}

                    {/* Input Devices */}
                    {data.input_devices.length > 0 && (
                        <div className="audio-section">
                            <div className="audio-section__title">Entrada de Áudio</div>
                            {data.input_devices.map(device => renderDeviceItem(device, false))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default AudioPopup
