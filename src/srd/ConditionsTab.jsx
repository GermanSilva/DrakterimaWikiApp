import { useState, useEffect } from 'react'
import { fetchConditions } from './srdApi'
import { SRDDetailHeader, RawDataSection } from './srdCommon'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

function ConditionDetail({ cond, onBack }) {
  const paragraphs = Array.isArray(cond.desc) ? cond.desc : [cond.desc].filter(Boolean)
  return (
    <div>
      <SRDDetailHeader name={cond.name} subtitle="Condición" onBack={onBack} />
      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Efecto</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
      <RawDataSection data={cond} />
    </div>
  )
}

export default function ConditionsTab() {
  const [conditions, setConditions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchConditions()
      .then(({ results }) => setConditions(results))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (selected) return <ConditionDetail cond={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      {error && <div className="text-accent text-sm py-4 font-exo">{error}</div>}
      {loading && (
        <div className="text-txt-muted text-sm py-10 text-center font-exo tracking-[0.1em] uppercase">Cargando…</div>
      )}
      <div className="space-y-1">
        {conditions.map(cond => (
          <div
            key={cond.slug}
            onClick={() => setSelected(cond)}
            className="flex items-center px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{cond.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
