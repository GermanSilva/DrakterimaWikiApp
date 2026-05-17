import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText from '../components/WikiText'
import { Shield, Lock } from 'lucide-react'

const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

const ABILITY_SCORES = [
  ['FUE', 'stat_str'],
  ['DES', 'stat_dex'],
  ['CON', 'stat_con'],
  ['INT', 'stat_int'],
  ['SAB', 'stat_wis'],
  ['CAR', 'stat_cha'],
]

function abilityMod(base) {
  const mod = Math.floor((base - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function signedBonus(n) {
  return n >= 0 ? `+${n}` : `${n}`
}

// Card: modifier shown by default, base revealed on hover via absolute overlay
function ModStatBox({ label, base }) {
  const mod = abilityMod(base)
  return (
    <div className="group flex flex-col items-center gap-0.5">
      <span className="font-exo text-[14px] tracking-[0.08em] text-txt-muted uppercase leading-none">{label}</span>
      <div className="relative h-[16px] flex items-center justify-center min-w-[24px]">
        <span className="font-exo text-[16px] font-bold text-txt-primary group-hover:opacity-0 transition-opacity duration-150 leading-none">{mod}</span>
        <span className="absolute inset-0 flex items-center justify-center font-exo text-[16px] font-bold text-accent-dim opacity-0 group-hover:opacity-100 transition-opacity duration-150 leading-none">{base}</span>
      </div>
    </div>
  )
}

// Detail: always shows modifier large + base below
function AbilityBox({ label, base }) {
  const mod = abilityMod(base)
  return (
    <div className="flex flex-col items-center bg-bg-mid border border-border-base px-3 py-2 min-w-[52px]">
      <span className="font-exo text-[16px] font-bold text-txt-primary leading-none mb-0.5">{mod}</span>
      <span className="font-exo text-[10px] text-txt-secondary leading-none mb-1">{base}</span>
      <span className="font-exo text-[8px] tracking-[0.1em] text-txt-muted uppercase leading-none">{label}</span>
    </div>
  )
}

// Detail: HP, AC, Speed, Initiative badges
function StatBadge({ label, value }) {
  return (
    <div className="flex flex-col items-center bg-bg-mid border border-border-base px-4 py-2 min-w-[56px]">
      <span className="font-exo text-[18px] font-bold text-txt-primary leading-none mb-0.5">{value}</span>
      <span className="font-exo text-[8px] tracking-[0.1em] text-txt-muted uppercase leading-none">{label}</span>
    </div>
  )
}

const sectionTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-2'
const detailTextCls = 'text-sm leading-7 text-txt-secondary'
const detailSectionCls = 'mt-5 pt-4 border-t border-border-base'
const dmSectionCls = 'mt-5 pt-4 border-t-2 border-t-accent'
const dmTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2'
const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function PJDetailInline({ pj, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && <button className={btnSecondary} onClick={() => openForm('pjs', pj.id)}>Editar</button>}
      </div>

      <div className="mb-8 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pj.region] || '#6e6e6e' }}>
          Personaje Jugador · Nv. {pj.nivel || 1}
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          {pj.nombre}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Tag cls="pj" text={pj.clase || '?'} />
          {pj.raza && <Tag cls="neutral" text={pj.raza} />}
          {pj.region && <RegionTag region={pj.region} />}
          {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {pj.imagen_url && (
        <div className="my-4 text-center">
          <img src={pj.imagen_url} alt={pj.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6 max-md:grid-cols-1">
        <div className="mb-3">
          <label className="block font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase mb-0.5">Jugador</label>
          <span className="text-sm text-txt-primary">{pj.jugador || '—'}</span>
        </div>
        <div className="mb-3">
          <label className="block font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase mb-0.5">Nivel</label>
          <span className="text-sm text-txt-primary">{pj.nivel || 1}</span>
        </div>
      </div>

      {(pj.stat_hp || pj.stat_ac || pj.stat_str || pj.stat_dex || pj.stat_con || pj.stat_int || pj.stat_wis || pj.stat_cha) && (
        <div className={detailSectionCls}>
          <div className={sectionTitleCls}>Stats</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {pj.stat_hp > 0 && <StatBadge label="HP Máx." value={pj.stat_hp} />}
            {pj.stat_ac > 0 && <StatBadge label="AC" value={pj.stat_ac} />}
            {pj.stat_speed > 0 && <StatBadge label="Velocidad" value={`${pj.stat_speed} ft`} />}
            {pj.stat_initiative !== undefined && <StatBadge label="Iniciativa" value={signedBonus(pj.stat_initiative)} />}
          </div>
          <div className="flex flex-wrap gap-2">
            {ABILITY_SCORES.map(([label, key]) => (
              <AbilityBox key={key} label={label} base={pj[key] ?? 0} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
        <div>
          {pj.trasfondo && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Trasfondo</div>
              <div className={detailTextCls}><WikiText text={pj.trasfondo} /></div>
            </div>
          )}
          {pj.motivo && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Motivación · Gremio</div>
              <div className={detailTextCls}>{pj.motivo}</div>
            </div>
          )}
        </div>
        <div>
          {pj.magralita && (
            <div className={detailSectionCls}>
              <div className={sectionTitleCls}>Relación con la Magralita</div>
              <div className={detailTextCls}>{pj.magralita}</div>
            </div>
          )}
          {isDM && pj.notas && (
            <div className={dmSectionCls}>
              <div className={dmTitleCls}><Lock size={10} className="inline mr-1" />Notas DM</div>
              <div className={detailTextCls}><WikiText text={pj.notas} /></div>
            </div>
          )}
        </div>
      </div>
      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}

export default function PJs() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  if (selectedId !== null) {
    const pj = db.pjs.find(p => p.id === selectedId)
    if (pj) return <PJDetailInline pj={pj} onBack={() => setSelectedId(null)} />
  }

  const visible = db.pjs.filter(p => isVisible(p, isDM, currentPlayer))
  const lista = query.trim()
    ? visible.filter(p =>
        [p.nombre, p.clase, p.raza, p.jugador].some(v =>
          (v || '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : visible

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('pjs')}
          >
            + Nuevo PJ
          </button>
        )}
      </PageHeader>

      <div className="mb-5">
        <input
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar por nombre, clase, raza o jugador…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<Shield size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PJs que coincidan con la búsqueda.' : 'Agregá los personajes jugadores creados en la sesión cero.'}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(p => (
            <div
              key={p.id}
              className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
              onClick={() => setSelectedId(p.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-exo text-[16px] font-semibold text-txt-primary tracking-[0.03em]">
                  {p.nombre}
                </div>
                <div className="flex items-center gap-1.5">
                  {isDM && p.notas && <Lock size={10} className="opacity-45" title="Tiene notas DM" />}
                  <Shield size={16} className="opacity-55" />
                </div>
              </div>
              <div className="font-exo text-[14px] text-txt-muted font-medium mb-2.5">
                {p.jugador || <span className="text-txt-muted">Sin asignar</span>}
              </div>
              <div className="flex flex-wrap gap-[5px] mb-2.5">
                <Tag cls="pj" text={`${p.clase} - Nv. ${p.nivel || 1}`} />
                {p.raza && <Tag cls="neutral" text={p.raza} />}
                {p.region && <RegionTag region={p.region} />}
                {p.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {p.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
                {p.trasfondo || 'Sin trasfondo registrado.'}
              </div>
              {(p.stat_hp || p.stat_ac || p.stat_str || p.stat_dex || p.stat_con || p.stat_int || p.stat_wis || p.stat_cha) && (
                <div className="mt-2.5 pt-2.5 border-t border-border-base">
                  <div className="flex justify-evenly gap-3 mb-2 flex-wrap">
                    {p.stat_hp > 0 && (
                      <div className="flex flex-col justify-center items-center">
                        <span className="font-exo text-[13px] text-txt-muted uppercase">HP</span>
                        <span className="font-exo text-[14px] font-bold text-txt-primary">{p.stat_hp}</span>
                      </div>
                    )}
                    {p.stat_ac > 0 && (
                      <div className="flex flex-col justify-center items-center">
                        <span className="font-exo text-[13px] text-txt-muted uppercase">AC</span>
                        <span className="font-exo text-[14px] font-bold text-txt-primary">{p.stat_ac}</span>
                      </div>
                    )}
                    {p.stat_speed > 0 && (
                      <div className="flex flex-col justify-center items-center">
                        <span className="font-exo text-[13px] text-txt-muted uppercase">Vel.</span>
                        <span className="font-exo text-[14px] font-bold text-txt-primary">{p.stat_speed}ft</span>
                      </div>
                    )}
                    {p.stat_initiative !== undefined && p.stat_initiative !== 0 && (
                      <div className="flex flex-col justify-center items-center">
                        <span className="font-exo text-[13px] text-txt-muted uppercase">Init.</span>
                        <span className="font-exo text-[14px] font-bold text-txt-primary">{signedBonus(p.stat_initiative)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-between">
                    {ABILITY_SCORES.map(([label, key]) => (
                      <ModStatBox key={key} label={label} base={p[key] ?? 0} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
