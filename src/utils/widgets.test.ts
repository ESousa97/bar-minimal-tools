import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../config/defaultConfig'
import { normalizeWidgets, WIDGET_DEFINITIONS } from './widgets'

describe('widgets utils', () => {
  it('normalizes widget list and fills defaults', () => {
    const input = [
      { id: 'cpu-1', type: 'cpu', enabled: false, order: 5 },
      { id: 'cpu-2', type: 'cpu', enabled: true, order: 1 },
    ]

    const result = normalizeWidgets(input)

    const cpu = result.find(w => w.type === 'cpu')
    expect(cpu).toBeDefined()
    expect(cpu?.id).toBe('cpu-2')
    expect(cpu?.enabled).toBe(true)

    const missing = result.find(w => w.type === 'network')
    expect(missing).toBeDefined()
  })

  it('buildDefaultConfig uses widget definitions', () => {
    const config = buildDefaultConfig()

    expect(config.widgets.length).toBe(WIDGET_DEFINITIONS.length)
    const types = new Set(config.widgets.map(w => w.type))
    for (const def of WIDGET_DEFINITIONS) {
      expect(types.has(def.type)).toBe(true)
    }
  })
})
