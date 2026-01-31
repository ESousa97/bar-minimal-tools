import { WidgetConfig } from '../../../types'
import { getWidgetLabel } from '../../../utils/widgets'
import { ChevronDownIcon, ChevronUpIcon } from '../../icons'

interface WidgetsTabProps {
    widgets: WidgetConfig[]
    updateWidget: (id: string, updates: Partial<WidgetConfig>) => void
    moveWidget: (id: string, direction: 'up' | 'down') => void
}

export function WidgetsTab({ widgets, updateWidget, moveWidget }: WidgetsTabProps) {
    const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order)

    return (
        <div className="settings-section">
            <p className="settings-hint">Arraste para reordenar ou clique no toggle para ativar/desativar.</p>
            <div className="widget-list">
                {sortedWidgets.map((widget, idx, arr) => (
                    <div key={widget.id} className="widget-item">
                        <div className="widget-item__controls">
                            <button
                                className="widget-item__move"
                                onClick={() => moveWidget(widget.id, 'up')}
                                disabled={idx === 0}
                            >
                                <ChevronUpIcon />
                            </button>
                            <button
                                className="widget-item__move"
                                onClick={() => moveWidget(widget.id, 'down')}
                                disabled={idx === arr.length - 1}
                            >
                                <ChevronDownIcon />
                            </button>
                        </div>
                        <span className="widget-item__name">
                            {getWidgetLabel(widget.type)}
                        </span>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={widget.enabled}
                                onChange={e => updateWidget(widget.id, { enabled: e.target.checked })}
                            />
                            <span className="toggle__slider"></span>
                        </label>
                    </div>
                ))}
            </div>
        </div>
    )
}
