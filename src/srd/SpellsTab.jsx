import { useState, useRef, useEffect } from 'react'
import { fetchSpells } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']

function SpellDetail({ spell, onBack }) {
  const school = spell.school?.name ?? spell.school ?? ''
  const levelLabel = spell.level_int === 0 ? 'Truco' : `Nivel ${spell.level_int}`

  return (
    <div>
      <SRDDetailHeader name={spell.name} subtitle={`Hechizo · ${levelLabel} · ${school}`} onBack={onBack} />

      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Descripción</div>
        {(spell.desc || '').split('\n').filter(Boolean).map((p, i) => (
          <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
        ))}
        {spell.higher_level && (
          <>
            <div className={`${sectionTitleCls} mt-4`}>A niveles superiores</div>
            <p className={detailTextCls}>{spell.higher_level}</p>
          </>
        )}
      </div>

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['Tiempo de lanzamiento', spell.casting_time],
            ['Alcance', spell.range],
            ['Componentes', spell.components],
            ['Duración', spell.duration],
            ['Concentración', spell.concentration ? 'Sí' : null],
            ['Ritual', spell.ritual ? 'Sí' : null],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {spell.dnd_class && (
        <div className={detailSectionCls}>
          <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium mb-1">Clases</div>
          <div className="text-txt-secondary text-sm">{spell.dnd_class}</div>
        </div>
      )}
      <RawDataSection data={spell} />
    </div>
  )
}

export default function SpellsTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchSpells)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [school, setSchool] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, level, school }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, level, school])

  if (selected) return <SpellDetail spell={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar hechizo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={level} onChange={e => setLevel(e.target.value)}>
          <option value="">Nivel</option>
          <option value="0">Truco (0)</option>
          {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>Nivel {n}</option>)}
        </select>
        <select className={inputCls} style={{ width: 'auto' }} value={school} onChange={e => setSchool(e.target.value)}>
          <option value="">Escuela</option>
          {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || level || school ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={spell => (
          <div
            key={spell.slug}
            onClick={() => setSelected(spell)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{spell.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              {spell.level_int === 0 ? 'Truco' : `Nv ${spell.level_int}`} · {spell.school?.name ?? spell.school}
            </span>
          </div>
        )}
      />
    </div>
  )
}
