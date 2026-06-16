import { useState, useRef, useEffect } from 'react'
import { fetchMonsters } from './srdApi'
import { useTabFetch, SRDDetailHeader, SRDList, RawDataSection } from './srdCommon'
import { inputCls, sectionTitleCls, detailTextCls, detailSectionCls } from '../constants'

const CR_OPTIONS = [
  { label: '0', value: '0' },
  { label: '⅛', value: '0.125' },
  { label: '¼', value: '0.25' },
  { label: '½', value: '0.5' },
  ...Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })),
]

const MONSTER_TYPES = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
  'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
  'Monstrosity', 'Ooze', 'Plant', 'Undead',
]

function statMod(score) {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

function formatSpeed(speed) {
  if (!speed) return '—'
  if (typeof speed === 'string') return speed
  return Object.entries(speed)
    .filter(([, v]) => v)
    .map(([k, v]) => k === 'walk' ? v : `${k} ${v}`)
    .join(', ')
}

function MonsterDetail({ monster, onBack }) {
  const stats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
  const statLabels = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR']

  return (
    <div>
      <SRDDetailHeader
        name={monster.name}
        subtitle={`${monster.size ?? ''} ${monster.type ?? ''} · CR ${monster.challenge_rating}`}
        onBack={onBack}
      />

      <div className={detailSectionCls}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            ['CA', monster.armor_class + (monster.armor_desc ? ` (${monster.armor_desc})` : '')],
            ['PV', `${monster.hit_points} (${monster.hit_dice})`],
            ['Velocidad', formatSpeed(monster.speed)],
            ['Alineamiento', monster.alignment],
            ['CR', monster.challenge_rating],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <div className="font-exo text-[9px] tracking-[0.2em] text-txt-muted uppercase font-medium">{k}</div>
              <div className="text-txt-secondary text-[13px] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={detailSectionCls}>
        <div className={sectionTitleCls}>Estadísticas</div>
        <div className="grid grid-cols-6 gap-2 text-center">
          {stats.map((stat, i) => (
            <div key={stat} className="border border-border-base p-2">
              <div className="font-exo text-[9px] tracking-[0.15em] text-txt-muted uppercase font-semibold">{statLabels[i]}</div>
              <div className="font-exo text-[15px] font-bold text-txt-primary mt-0.5">{monster[stat]}</div>
              <div className="font-exo text-[11px] text-txt-muted">{statMod(monster[stat])}</div>
            </div>
          ))}
        </div>
      </div>

      {monster.special_abilities?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Habilidades especiales</div>
          {monster.special_abilities.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.actions?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Acciones</div>
          {monster.actions.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.legendary_actions?.length > 0 && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Acciones legendarias</div>
          {monster.legendary_actions.map((a, i) => (
            <div key={i} className="mb-3">
              <div className="font-exo text-[11px] font-semibold text-txt-primary">{a.name}</div>
              <p className={`${detailTextCls} mt-0.5`}>{a.desc}</p>
            </div>
          ))}
        </div>
      )}

      {monster.desc && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Descripción</div>
          {monster.desc.split('\n').filter(Boolean).map((p, i) => (
            <p key={i} className={`${detailTextCls} mb-2`}>{p}</p>
          ))}
        </div>
      )}
      <RawDataSection data={monster} />
    </div>
  )
}

export default function MonstersTab() {
  const { results, loading, error, nextUrl, run } = useTabFetch(fetchMonsters)
  const [search, setSearch] = useState('')
  const [cr, setCr] = useState('')
  const [type, setType] = useState('')
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => run({ search, challenge_rating: cr, type }), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search, cr, type])

  if (selected) return <MonsterDetail monster={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className={`${inputCls} flex-1 min-w-[160px]`}
          placeholder="Buscar monstruo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={inputCls} style={{ width: 'auto' }} value={cr} onChange={e => setCr(e.target.value)}>
          <option value="">CR</option>
          {CR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={inputCls} style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">Tipo</option>
          {MONSTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <SRDList
        results={results}
        loading={loading}
        error={error}
        nextUrl={nextUrl}
        onLoadMore={() => run({ pageUrl: nextUrl }, true)}
        emptyMsg={search || cr || type ? 'Sin resultados' : 'Introducí una búsqueda'}
        renderItem={monster => (
          <div
            key={monster.slug}
            onClick={() => setSelected(monster)}
            className="flex items-center justify-between px-4 py-3 border border-border-base hover:border-accent-dim hover:bg-accent/[.04] cursor-pointer transition-all"
          >
            <span className="font-exo text-[13px] font-medium text-txt-primary">{monster.name}</span>
            <span className="font-exo text-[10px] text-txt-muted uppercase tracking-wider ml-4 whitespace-nowrap shrink-0">
              CR {monster.challenge_rating} · {monster.type}
            </span>
          </div>
        )}
      />
    </div>
  )
}
