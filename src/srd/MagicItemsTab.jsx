import { useState, useRef, useEffect } from 'react'
import { fetchMagicItems } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary']

function MagicItemDetail({ item, onBack }) {
  const attunement = item.requires_attunement
    ? (typeof item.requires_attunement === 'string' ? item.requires_attunement : 'Sí')
    : null
  const paragraphs = Array.isArray(item.desc) ? item.desc : [item.desc].filter(Boolean)

  return (
    <div>
      <SRDDetailHeader
        name={item.name}
        subtitle={`Ítem mágico · ${item.rarity ?? ''} · ${item.type ?? ''}`}
        onBack={onBack}
      />

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {[
            ['Rareza', item.rarity],
            ['Tipo', item.type],
            ['Sintonía', attunement],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className={sectionTitleCls}>Descripción</div>
        {paragraphs.map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
      </div>
      <RawDataSection data={item} />
    </div>
  )
}

export default function MagicItemsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchMagicItems)
  const [search, setSearch] = useState('')
  const [rarity, setRarity] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, rarity }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, rarity])

  if (selected) return <MagicItemDetail item={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar ítem mágico…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={rarity} onChange={e => setRarity(e.target.value)}>
          <option value="">Rareza</option>
          {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || rarity ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={item => (
          <div
            key={item.slug}
            onClick={() => setSelected(item)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{item.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {item.rarity} · {item.type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
