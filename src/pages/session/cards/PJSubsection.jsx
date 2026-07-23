import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { btnSecondary } from '../../../constants'

export default function PJSubsection({ pj, onEdit, fullViewToggle = false, collapsed: collapsedProp, onToggleCollapsed, noPadding = false, children }) {
  const [collapsedState, setCollapsedState] = useState(true)
  const [fullView, setFullView] = useState(true)
  const isControlled = collapsedProp !== undefined
  const collapsed = isControlled ? collapsedProp : collapsedState
  const toggleCollapsed = () => {
    if (isControlled) onToggleCollapsed?.()
    else setCollapsedState(prev => !prev)
  }

  return (
    <div className="border border-border-base p-1 relative">
      <div className={`flex justify-between items-center ${collapsed || noPadding ? 'mb-0' : 'mb-2'}`}>
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.08em] cursor-pointer bg-transparent border-none pl-2"
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {pj.nombre}
        </button>
        <div className="flex items-center gap-2">
          {(fullViewToggle && !collapsed) && (
            <button
              type="button"
              className={`${btnSecondary} p-1 ${fullView ? 'border-accent-dim text-accent-dim' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFullView(prev => !prev) }}
            >
              {fullView ? 'Ver menos' : 'Ver más'}
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={(e) => { e.stopPropagation(); onEdit?.(pj) }}>Editar</button>
        </div>
      </div>
      {!collapsed && (typeof children === 'function' ? children({ fullView }) : children)}
    </div>
  )
}
