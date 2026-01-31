import { useEffect, useState, useRef, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { WeatherData, WeatherConfig, LocationData } from '../../types'
import {
    SunIcon,
    MoonIcon,
    CloudIcon,
    CloudSunIcon,
    CloudRainIcon,
    CloudDrizzleIcon,
    CloudLightningIcon,
    SnowflakeIcon,
    FogIcon,
    ThermometerIcon
} from '../icons'

// Weather icon mapping to SVG components
const weatherIcons: Record<string, ReactNode> = {
    '01d': <SunIcon />,
    '01n': <MoonIcon />,
    '02d': <CloudSunIcon />,
    '02n': <CloudIcon />,
    '03d': <CloudIcon />,
    '03n': <CloudIcon />,
    '04d': <CloudIcon />,
    '04n': <CloudIcon />,
    '09d': <CloudDrizzleIcon />,
    '09n': <CloudDrizzleIcon />,
    '10d': <CloudRainIcon />,
    '10n': <CloudRainIcon />,
    '11d': <CloudLightningIcon />,
    '11n': <CloudLightningIcon />,
    '13d': <SnowflakeIcon />,
    '13n': <SnowflakeIcon />,
    '50d': <FogIcon />,
    '50n': <FogIcon />,
}

export function WeatherWidget() {
    const [data, setData] = useState<WeatherData | null>(null)
    const [config, setConfig] = useState<WeatherConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [useFallbackIcon, setUseFallbackIcon] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const widgetRef = useRef<HTMLDivElement>(null)
    const collapseTimeoutRef = useRef<number | null>(null)

    // Load config first
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const weatherConfig = await invoke<WeatherConfig>('get_weather_config')
                setConfig(weatherConfig)
            } catch (err) {
                console.error('Failed to load weather config:', err)
                // Use defaults with auto location
                setConfig({
                    enabled: true,
                    useAutoLocation: true,
                    latitude: -23.5505,
                    longitude: -46.6333,
                    cityName: 'São Paulo'
                })
            }
        }
        loadConfig()
        
        // Listen for config changes from weather popup
        const unlisten = listen<WeatherConfig>('weather-config-changed', (event) => {
            setConfig(event.payload)
            setLoading(true) // Trigger reload
        })
        return () => {
            unlisten.then(fn => fn())
        }
    }, [])

    // Fetch weather data when config is loaded
    useEffect(() => {
        if (!config) return

        const fetchData = async () => {
            try {
                let lat = config.latitude
                let lon = config.longitude
                
                // If auto location is enabled, get current location
                if (config.useAutoLocation) {
                    const location = await invoke<LocationData>('get_current_location')
                    if (location.success) {
                        lat = location.latitude
                        lon = location.longitude
                    }
                }
                
                const weatherData = await invoke<WeatherData>('get_weather', { lat, lon })
                setData(weatherData)
            } catch (err) {
                console.error('Failed to fetch weather data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        // Update every 10 minutes
        const interval = setInterval(fetchData, 10 * 60 * 1000)
        return () => clearInterval(interval)
    }, [config])

    const handleClick = () => {
        // Toggle expanded state - show/hide location
        setExpanded(prev => !prev)
        
        // Clear any existing collapse timeout
        if (collapseTimeoutRef.current) {
            clearTimeout(collapseTimeoutRef.current)
            collapseTimeoutRef.current = null
        }
        
        // Auto-collapse after 5 seconds when expanded
        if (!expanded) {
            collapseTimeoutRef.current = window.setTimeout(() => {
                setExpanded(false)
                collapseTimeoutRef.current = null
            }, 5000)
        }
    }

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (collapseTimeoutRef.current) {
                clearTimeout(collapseTimeoutRef.current)
            }
        }
    }, [])

    // Don't render if disabled
    if (config && !config.enabled) {
        return null
    }

    if (loading || !data?.loaded) {
        return (
            <div className="widget widget--weather widget--loading">
                <span className="widget__icon"><ThermometerIcon /></span>
            </div>
        )
    }

    const iconUrl = `https://openweathermap.org/img/wn/${data.icon}@2x.png`
    const fallbackIcon = weatherIcons[data.icon] || <ThermometerIcon />
    const locationName = config?.cityName || data.city || 'Local'

    return (
        <div 
            ref={widgetRef}
            className={`widget widget--weather widget--inline${expanded ? ' widget--weather-expanded' : ''}`}
            onClick={handleClick}
            title={`${locationName}: ${data.description}\nSensação: ${data.feels_like.toFixed(0)}°C\nUmidade: ${data.humidity}%`}
        >
            <div className="widget__icon weather-widget__icon">
                {useFallbackIcon ? (
                    <span className="weather-widget__svg-icon">{fallbackIcon}</span>
                ) : (
                    <img 
                        src={iconUrl} 
                        alt={data.description}
                        className="weather-widget__img"
                        onError={() => setUseFallbackIcon(true)}
                    />
                )}
            </div>
            <div className="widget__content weather-widget__content">
                <span className="weather-widget__temp">{data.temperature.toFixed(0)}°</span>
                {expanded && (
                    <span className="weather-widget__location">{locationName}</span>
                )}
            </div>
        </div>
    )
}

export default WeatherWidget
