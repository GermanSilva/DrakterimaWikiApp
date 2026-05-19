import { useApp } from '../../AppContext'
import { COLLECTION_LETTER } from '../../components/WikiText'
import { Tag, RegionTag } from '../../components/Shared'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import { Lock } from 'lucide-react'
import { REGION_COLOR, SKILLS_BY_ABILITY, sectionTitleCls, detailTextCls } from './pjConstants'
import PJStatsSection from './detail/PJStatsSection'
import PJSkillsSection from './detail/PJSkillsSection'
import PJAttacksSection from './detail/PJAttacksSection'
import PJSpellsSection from './detail/PJSpellsSection'
import PJEquipmentSection from './detail/PJEquipmentSection'
import PJTraitsSection from './detail/PJTraitsSection'
import PJNarrativeSection from './detail/PJNarrativeSection'
import PJAppearanceSection from './detail/PJAppearanceSection'

const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function hasStats(pj) {
  return !!(pj.stat_hp || pj.stat_ac || pj.stat_str || pj.stat_dex || pj.stat_con || pj.stat_int || pj.stat_wis || pj.stat_cha)
}

function hasSkills(pj) {
  const saveKeys = ['save_str', 'save_dex', 'save_con', 'save_int', 'save_wis', 'save_cha']
  const skillKeys = SKILLS_BY_ABILITY.flatMap(g => g.skills.map(s => s.key))
  return !!(pj.stat_proficiency_bonus || saveKeys.some(k => pj[k]) || skillKeys.some(k => pj[k] > 0))
}

function hasSpells(pj) {
  return !!((pj.hechizos?.length > 0) || pj.spell_dc > 0 || pj.spell_attack_bonus)
}

function hasEquipment(pj) {
  const monedas = pj.monedas ?? {}
  return !!(pj.equipo?.length > 0 || Object.values(monedas).some(v => v > 0))
}

function hasTraits(pj) {
  return !!(pj.rasgos_clase || pj.idiomas || pj.prof_armas || pj.prof_armaduras || pj.prof_herramientas || pj.otros_rasgos)
}

function hasNarrative(pj) {
  return !!(pj.trasfondo || pj.motivo || pj.magralita)
}

function hasAppearance(pj) {
  return !!(pj.edad || pj.altura || pj.personalidad || pj.ideales || pj.vinculos || pj.defectos || pj.apariencia)
}

const ANCHORS = [
  { id: 'stats',       label: 'Stats',       show: hasStats },
  { id: 'habilidades', label: 'Habilidades', show: hasSkills },
  { id: 'ataques',     label: 'Ataques',     show: p => p.ataques?.length > 0 },
  { id: 'hechizos',    label: 'Hechizos',    show: hasSpells },
  { id: 'equipo',      label: 'Equipo',      show: hasEquipment },
  { id: 'rasgos',      label: 'Rasgos',      show: hasTraits },
  { id: 'narrativa',   label: 'Narrativa',   show: hasNarrative },
  { id: 'apariencia',  label: 'Apariencia',  show: hasAppearance },
]

export default function PJDetail({ pj, onBack }) {
  const { openForm, isDM } = useApp()
  const visibleAnchors = ANCHORS.filter(a => a.show(pj))
  const hasDMNotes = isDM && !!pj.notas

  function scrollTo(id) {
    document.getElementById(`pj-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">
              {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
            </span>
            <button className={btnSecondary} onClick={() => openForm('pjs', pj.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pj.region] || '#6e6e6e' }}>
          Personaje Jugador
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</div>
        <div className="font-exo text-[16px] font-semibold uppercase text-txt-muted -mt-1">{pj.jugador}</div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Tag cls="pj" text={`${pj.clase || '?'} - Nv. ${pj.nivel || 1}`} />
          {pj.raza && <Tag cls="neutral" text={pj.raza} />}
          {pj.region && <RegionTag region={pj.region} />}
          {pj.alineamiento && <Tag cls="neutral" text={pj.alineamiento} />}
          {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {pj.imagen_url && (
        <div className="my-4 text-center">
          <img src={pj.imagen_url} alt={pj.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      {(visibleAnchors.length > 0 || hasDMNotes) && (
        <div className="sticky top-0 z-10 bg-bg-card border-b border-border-base mb-2 overflow-x-auto">
          <div className="flex min-w-max">
            {visibleAnchors.map(a => (
              <button key={a.id} className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-txt-muted hover:text-txt-primary hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors" onClick={() => scrollTo(a.id)}>
                {a.label}
              </button>
            ))}
            {hasDMNotes && (
              <button className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-accent-dim hover:text-accent-bright hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors" onClick={() => scrollTo('dm')}>
                🔒 DM
              </button>
            )}
          </div>
        </div>
      )}

      {hasStats(pj) && <PJStatsSection pj={pj} />}
      {hasSkills(pj) && <PJSkillsSection pj={pj} />}
      {pj.ataques?.length > 0 && <PJAttacksSection pj={pj} />}
      {hasSpells(pj) && <PJSpellsSection pj={pj} />}
      {hasEquipment(pj) && <PJEquipmentSection pj={pj} />}
      {hasTraits(pj) && <PJTraitsSection pj={pj} />}
      {hasNarrative(pj) && <PJNarrativeSection pj={pj} />}
      {hasAppearance(pj) && <PJAppearanceSection pj={pj} />}

      {hasDMNotes && (
        <div id="pj-section-dm" className="mt-5 pt-4 border-t-2 border-t-accent">
          <div className="font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2">
            <Lock size={10} className="inline mr-1" />Notas DM
          </div>
          <div className={detailTextCls}><WikiText text={pj.notas} /></div>
        </div>
      )}

      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}
