import { useState, useRef, useEffect } from 'react'
import { fetchWeapons } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
import { inputCls, detailSectionCls } from '../constants'

const WEAPON_CATEGORIES = [
  'Simple Melee Weapons',
  'Simple Ranged Weapons',
  'Martial Melee Weapons',
  'Martial Ranged Weapons',
]

function WeaponDetail({ weapon, onBack }) {
  const properties = (weapon.properties || []).map(p => p.name ?? p).join(', ')
  return (
    <div>
      <SRDDetailHeader name={weapon.name} subtitle={`Arma · ${weapon.category ?? ''}`} onBack={onBack} />
      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Daño', weapon.damage_dice ? `${weapon.damage_dice} ${weapon.damage_type ?? ''}` : null],
            ['Categoría', weapon.category],
            ['Propiedades', properties || null],
            ['Peso', weapon.weight],
            ['Precio', weapon.cost],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <RawDataSection data={weapon} />
    </div>
  )
}

export default function WeaponsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchWeapons)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, category }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, category])

  if (selected) return <WeaponDetail weapon={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar arma…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Categoría</option>
          {WEAPON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || category ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={weapon => (
          <div
            key={weapon.slug}
            onClick={() => setSelected(weapon)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{weapon.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {weapon.damage_dice} · {weapon.damage_type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
