import { useState, useRef, useEffect } from 'react'
import { fetchArmors } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
import { inputCls, detailSectionCls } from '../constants'

const ARMOR_CATEGORIES = ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield']

function formatAC(ac) {
  if (!ac) return '—'
  if (typeof ac === 'number' || typeof ac === 'string') return String(ac)
  const base = ac.base ?? ''
  const dex = ac.dex_bonus ? ' + Dex' : ''
  const maxDex = ac.max_bonus != null ? ` (máx ${ac.max_bonus})` : ''
  return `${base}${dex}${maxDex}`
}

function ArmorDetail({ armor, onBack }) {
  return (
    <div>
      <SRDDetailHeader name={armor.name} subtitle={`Armadura · ${armor.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', formatAC(armor.armor_class)],
            ['Categoría', armor.category],
            ['Req. Fuerza', armor.strength_prerequisite ? `FUE ${armor.strength_prerequisite}` : null],
            ['Desventaja sigilo', armor.stealth_disadvantage ? 'Sí' : null],
            ['Peso', armor.weight],
            ['Precio', armor.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <RawDataSection data={armor} />
    </div>
  )
}

export default function ArmorsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchArmors)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, category }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, category])

  if (selected) return <ArmorDetail armor={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar armadura…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Categoría</option>
          {ARMOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || category ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={armor => (
          <div
            key={armor.slug}
            onClick={() => setSelected(armor)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{armor.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              CA {formatAC(armor.armor_class)} · {armor.category}
            </span>
          </div>
        )}
      />
    </div>
  )
}
