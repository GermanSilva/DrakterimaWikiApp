import { btnSecondary } from '../../../constants'

export default function PJSubsection({ pj, onEdit, children }) {
  return (
    <div className="border border-border-base p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="font-exo text-[12px] font-semibold text-txt-primary uppercase tracking-[0.08em]">{pj.nombre}</span>
        <button type="button" className={btnSecondary} onClick={() => onEdit?.(pj)}>Editar</button>
      </div>
      {children}
    </div>
  )
}
