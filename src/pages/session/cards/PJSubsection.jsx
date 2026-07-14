import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { btnSecondary } from '../../../constants'

export default function PJSubsection({ pj, onEdit, children }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border border-border-base p-3">
      <div className="flex justify-between items-center mb-2">
        <button
          type="button"
          className="flex items-center gap-1.5 font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.08em] cursor-pointer bg-transparent border-none p-0"
          onClick={() => setCollapsed(prev => !prev)}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {pj.nombre}
        </button>
        <button type="button" className={btnSecondary} onClick={(e) => { e.stopPropagation(); onEdit?.(pj) }}>Editar</button>
      </div>
      {!collapsed && children}
    </div>
  )
}
