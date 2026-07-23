import { sectionTitleCls, detailSectionCls } from '../../../constants'

const RECUPERACION_LABEL = { corto: 'Descanso Corto', largo: 'Descanso Largo' }

function ResourceBadge({ recurso }) {
  return (
    <div className="flex flex-col items-center bg-bg-mid border border-border-base px-4 py-2 min-w-[90px]">
      <span className="font-exo text-[11px] tracking-[0.05em] text-txt-muted uppercase leading-none text-center">{recurso.nombre}</span>
      <span className="font-exo text-[20px] font-bold text-txt-primary leading-none mt-1.5">{recurso.actual}/{recurso.maximo}</span>
      <span className="font-exo text-[9px] text-txt-muted uppercase tracking-[0.1em] mt-1.5">
        {RECUPERACION_LABEL[recurso.recuperacion] ?? RECUPERACION_LABEL.largo}
      </span>
    </div>
  )
}

export default function PJResourcesSection({ pj }) {
  const recursos = pj.recursos ?? []
  if (recursos.length === 0) return null

  return (
    <div id="pj-section-recursos" className={detailSectionCls}>
      <div className={sectionTitleCls}>Recursos</div>
      <div className="flex flex-wrap gap-2">
        {recursos.map(r => <ResourceBadge key={r.id} recurso={r} />)}
      </div>
    </div>
  )
}
