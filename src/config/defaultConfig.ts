import type { AppConfig } from '../types'
import { WIDGET_DEFINITIONS } from '../utils/widgets'

export function buildDefaultConfig(): AppConfig {
  const now = new Date().toISOString()

  return {
    profileName: 'Default',
    createdAt: now,
    modifiedAt: now,
    display: {
      targetMonitor: 'monitor_0',
      barHeight: 32,
      theme: 'dark',
      opacity: 0.95,
      blur: true,
    },
    widgets: WIDGET_DEFINITIONS.map(def => ({
      id: def.id,
      type: def.type,
      enabled: def.defaultEnabled,
      order: def.defaultOrder,
    })),
    polling: {
      intervalMs: 1000,
      detailedIntervalMs: 5000,
    },
  }
}
