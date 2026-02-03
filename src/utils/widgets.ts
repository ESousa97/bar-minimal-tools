import type { AppConfig, WidgetConfig } from '../types'

export type WidgetSection = 'left' | 'right'

export interface WidgetDefinition {
  id: string
  type: string
  label: string
  defaultEnabled: boolean
  defaultOrder: number
  section: WidgetSection
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  { id: 'cpu-1', type: 'cpu', label: 'CPU', defaultEnabled: true, defaultOrder: 0, section: 'left' },
  { id: 'ram-1', type: 'ram', label: 'RAM', defaultEnabled: true, defaultOrder: 1, section: 'left' },
  { id: 'gpu-1', type: 'gpu', label: 'GPU', defaultEnabled: true, defaultOrder: 2, section: 'left' },
  { id: 'storage-1', type: 'storage', label: 'Storage', defaultEnabled: true, defaultOrder: 3, section: 'left' },
  { id: 'network-1', type: 'network', label: 'Network', defaultEnabled: true, defaultOrder: 4, section: 'left' },
  { id: 'media-1', type: 'media', label: 'Media', defaultEnabled: true, defaultOrder: 5, section: 'left' },
  { id: 'taskswitcher-1', type: 'taskswitcher', label: 'Janela Atual', defaultEnabled: true, defaultOrder: 6, section: 'left' },

  { id: 'notes-1', type: 'notes', label: 'Notas', defaultEnabled: true, defaultOrder: 89, section: 'right' },
  { id: 'audio-1', type: 'audio', label: 'Audio', defaultEnabled: true, defaultOrder: 90, section: 'right' },
  { id: 'headset-1', type: 'headset', label: 'Headset', defaultEnabled: true, defaultOrder: 91, section: 'right' },
  { id: 'weather-1', type: 'weather', label: 'Weather', defaultEnabled: false, defaultOrder: 92, section: 'right' },
  { id: 'clock-1', type: 'clock', label: 'Clock', defaultEnabled: true, defaultOrder: 93, section: 'right' },
]

function widgetKey(widget: Pick<WidgetConfig, 'id' | 'type'>): string {
  // Prefer stable `type` (we have 1 widget per type today)
  return widget.type || widget.id
}

export function normalizeWidgets(widgets: WidgetConfig[] | undefined | null): WidgetConfig[] {
  const existing = Array.isArray(widgets) ? widgets : []

  // Pick best candidate per type (or id) to avoid duplicates.
  const byKey = new Map<string, WidgetConfig>()
  for (const w of existing) {
    const key = widgetKey(w)
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, { ...w })
      continue
    }
    // Keep the one with smaller order (more “important”) to be deterministic.
    if ((w.order ?? 0) < (current.order ?? 0)) {
      byKey.set(key, { ...w })
    }
  }

  for (const def of WIDGET_DEFINITIONS) {
    const key = def.type
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: def.id,
        type: def.type,
        enabled: def.defaultEnabled,
        order: def.defaultOrder,
      })
    } else {
      const current = byKey.get(key)!
      // Ensure required fields exist and keep id stable when possible.
      byKey.set(key, {
        id: current.id || def.id,
        type: current.type || def.type,
        enabled: typeof current.enabled === 'boolean' ? current.enabled : def.defaultEnabled,
        order: typeof current.order === 'number' ? current.order : def.defaultOrder,
      })
    }
  }

  // Keep unknown widgets too (future-proof) by appending them.
  const knownTypes = new Set(WIDGET_DEFINITIONS.map(d => d.type))
  const unknown = existing
    .filter(w => !knownTypes.has(w.type))
    .map(w => ({ ...w }))

  const normalized = [...byKey.values(), ...unknown]

  // Ensure deterministic ordering
  normalized.sort((a, b) => a.order - b.order)
  return normalized
}

export function normalizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    widgets: normalizeWidgets(config.widgets),
  }
}

export function getWidgetSection(type: string): WidgetSection | null {
  return WIDGET_DEFINITIONS.find(d => d.type === type)?.section ?? null
}

export function getWidgetLabel(type: string): string {
  return WIDGET_DEFINITIONS.find(d => d.type === type)?.label ?? (type.charAt(0).toUpperCase() + type.slice(1))
}
