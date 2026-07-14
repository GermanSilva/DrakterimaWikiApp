import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { btnSecondary } from '../../../constants'

export default function PJSubsection({ pj, onEdit, fullViewToggle = false, collapsed: collapsedProp, onToggleCollapsed, children }) {
  const [collapsedState, setCollapsedState] = useState(true)
  const [fullView, setFullView] = useState(false)
  const isControlled = collapsedProp !== undefined
  const collapsed = isControlled ? collapsedProp : collapsedState
  const toggleCollapsed = () => {
    if (isControlled) onToggleCollapsed?.()
    else setCollapsedState(prev => !prev)
  }

  return (
    <div className="border border-border-base p-1">
      <div className={`flex justify-between items-center ${collapsed ? 'mb-0' : 'mb-2'}`}>
        <button
          type="button"
          className="flex items-center gap-1.5 font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.08em] cursor-pointer bg-transparent border-none pl-2"
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {pj.nombre}
        </button>
        <div className="flex items-center gap-2">
          {fullViewToggle && (
            <button
              type="button"
              className={`${btnSecondary} ${fullView ? 'border-accent-dim text-accent-dim' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFullView(prev => !prev) }}
            >
              Vista completa
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={(e) => { e.stopPropagation(); onEdit?.(pj) }}>Editar</button>
        </div>
      </div>
      {!collapsed && (typeof children === 'function' ? children({ fullView }) : children)}
    </div>
  )
}
