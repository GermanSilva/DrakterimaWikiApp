import { useRef, useState, useEffect } from 'react'
import { useApp } from '../../AppContext'
import { COLLECTION_LETTER } from '../../components/WikiText'
import { Tag, RegionTag } from '../../components/Shared'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import ImageLightbox from '../../components/ImageLightbox'
import { Lock } from 'lucide-react'
import { REGION_COLOR, detailTextCls } from './pjConstants'
import PJStatsSection from './detail/PJStatsSection'
import PJSkillsSection from './detail/PJSkillsSection'
import PJAttacksSection from './detail/PJAttacksSection'
import PJSpellsSection from './detail/PJSpellsSection'
import PJEquipmentSection from './detail/PJEquipmentSection'
import PJTraitsSection from './detail/PJTraitsSection'
import PJNarrativeSection from './detail/PJNarrativeSection'
import PJAppearanceSection from './detail/PJAppearanceSection'

const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'
const articleLink = 'inline-flex items-center gap-1.5 font-mono text-[11px] select-all cursor-text font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

const SECTIONS = [
  { id: 'stats',       label: 'Stats',       show: () => true,                                                                Component: PJStatsSection },
  { id: 'habilidades', label: 'Habilidades', show: () => true,                                                                Component: PJSkillsSection },
  { id: 'ataques',     label: 'Ataques',     show: p => p.ataques?.length > 0,                                               Component: PJAttacksSection },
  { id: 'hechizos',    label: 'Hechizos',    show: p => !!(p.hechizos?.length > 0 || Object.keys(p.spell_slots ?? {}).length > 0), Component: PJSpellsSection },
  { id: 'equipo',      label: 'Equipo',      show: p => !!(p.equipo?.length > 0 || Object.values(p.monedas ?? {}).some(v => v > 0)), Component: PJEquipmentSection },
  { id: 'rasgos',      label: 'Rasgos',      show: p => !!(p.rasgos_clase || p.idiomas || p.prof_armas || p.prof_armaduras || p.prof_herramientas || p.otros_rasgos), Component: PJTraitsSection },
  { id: 'narrativa',   label: 'Narrativa',   show: () => true,                                                                Component: PJNarrativeSection },
  { id: 'apariencia',  label: 'Apariencia',  show: p => !!(p.edad || p.altura || p.personalidad || p.ideales || p.vinculos || p.defectos || p.apariencia), Component: PJAppearanceSection },
]

export default function PJDetail({ pj, onEdit, onDelete, onBack }) {
  const { isDM } = useApp()
  const visibleSections = SECTIONS.filter(s => s.show(pj))
  const hasDMNotes = isDM && !!pj.notas

  const sentinelRef = useRef(null)
  const backBarRef = useRef(null)
  const stickyNavRef = useRef(null)
  const [showStickyNav, setShowStickyNav] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const hasNav = visibleSections.length > 0 || hasDMNotes

  const HEADER_H = 60

  function scrollTo(id) {
    const el = document.getElementById(`pj-section-${id}`)
    if (!el) return
    const offset = HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + (stickyNavRef.current?.offsetHeight ?? 0)
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
  }

  useEffect(() => {
    if (!sentinelRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const topOffset = HEADER_H + backBarH + 38
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyNav(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${topOffset}px 0px 0px 0px` }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNav])

  const navButtons = (
    <>
      {visibleSections.map(s => (
        <button
          key={s.id}
          className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-txt-muted hover:text-txt-primary hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
          onClick={() => scrollTo(s.id)}
        >
          {s.label}
        </button>
      ))}
      {hasDMNotes && (
        <button
          className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-accent-dim hover:text-accent-bright hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
          onClick={() => scrollTo('dm')}
        >
          <Lock size={10} className="inline mr-1" />DM
        </button>
      )}
    </>
  )

  return (
    <div>
      <div ref={backBarRef} className="flex justify-between mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className={articleLink} title="ID para wiki-link">
              {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
            </span>
            <button className={btnSecondary} onClick={onDelete}>Eliminar</button>
            <button className={btnSecondary} onClick={onEdit}>Editar</button>
          </div>
        )}
      </div>

      {showStickyNav && hasNav && (
        <div
          ref={stickyNavRef}
          className="sticky z-10 bg-bg-card border-b border-border-base overflow-x-auto"
          style={{ top: HEADER_H + (backBarRef.current?.offsetHeight ?? 0) }}
        >
          <div className="flex min-w-max">{navButtons}</div>
        </div>
      )}

      <div className='flex w-full gap-4'>
        <div className='flex-1 flex flex-col gap-2 h-fit'>
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

          {hasNav && (
            <div ref={sentinelRef} className="overflow-x-auto border-b border-border-base">
              <div className="flex min-w-max">{navButtons}</div>
            </div>
          )}
        </div>

        {pj.imagen_url && (
          <div className="my-4 -mb-40 text-center">
            <img
              src={pj.imagen_url}
              alt={pj.nombre}
              className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base cursor-zoom-in"
              onError={e => e.target.style.display = 'none'}
              onClick={() => setLightbox(true)}
            />
          </div>
        )}
        {lightbox && <ImageLightbox src={pj.imagen_url} alt={pj.nombre} onClose={() => setLightbox(false)} />}
      </div>

      {visibleSections.map(({ id, Component }) => (
        <Component key={id} pj={pj} />
      ))}

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
