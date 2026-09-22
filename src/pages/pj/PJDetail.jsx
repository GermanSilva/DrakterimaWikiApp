import { useRef, useState, useEffect, useMemo } from 'react'
import { useApp } from '../../AppContext'
import { Tag, RegionTag } from '../../components/Shared'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import ImageLightbox from '../../components/ImageLightbox'
import UnreadDot from '../../components/UnreadDot'
import { readStateMap, getViewerId } from '../../helpers'
import { isSectionUnread } from '../../helpers/pjSections'
import { SECTION_SHOW } from './pjConstants'
import LazyImg from '../../components/LazyImg'
import { Lock, Shield } from 'lucide-react'
import { detailTextCls } from '../../constants'
import { btnSecondary, REGION_COLOR } from '../../constants'
import PJStatsSection from './detail/PJStatsSection'
import PJSkillsSection from './detail/PJSkillsSection'
import PJAttacksSection from './detail/PJAttacksSection'
import PJSpellsSection from './detail/PJSpellsSection'
import PJEquipmentSection from './detail/PJEquipmentSection'
import PJResourcesSection from './detail/PJResourcesSection'
import PJTraitsSection from './detail/PJTraitsSection'
import PJNarrativeSection from './detail/PJNarrativeSection'
import PJAppearanceSection from './detail/PJAppearanceSection'

const SECTIONS = [
  { id: 'stats', label: 'Stats', Component: PJStatsSection },
  { id: 'habilidades', label: 'Habilidades', Component: PJSkillsSection },
  { id: 'ataques', label: 'Ataques', Component: PJAttacksSection },
  { id: 'hechizos', label: 'Hechizos', Component: PJSpellsSection },
  { id: 'recursos', label: 'Recursos', Component: PJResourcesSection },
  { id: 'equipo', label: 'Equipo', Component: PJEquipmentSection },
  { id: 'rasgos', label: 'Rasgos', Component: PJTraitsSection },
  { id: 'narrativa', label: 'Narrativa', Component: PJNarrativeSection },
  { id: 'apariencia', label: 'Apariencia', Component: PJAppearanceSection },
].map(s => ({ ...s, show: SECTION_SHOW[s.id] }))

const DWELL_MS = 1500
const SECTION_ID_PREFIX = 'pj-section-'

export default function PJDetail({ pj, onEdit, onDelete, onBack }) {
  const { db, isDM, currentPlayer, markSectionRead } = useApp()
  const isOwnPlayer = !isDM && currentPlayer?.id === pj.id

  const visibleSections = SECTIONS.filter(s => s.show(pj))
  const hasDMNotes = isDM && !!pj.notas

  const viewerId = getViewerId(isDM, currentPlayer)
  const readState = useMemo(() => readStateMap(db.read_state), [db.read_state])
  const unread = Object.fromEntries(
    [...visibleSections.map(s => s.id), 'dm', 'general'].map(k => [k, isSectionUnread(pj, k, viewerId, readState)])
  )
  const unreadKey = Object.keys(unread).filter(k => unread[k] && k !== 'general').join(',')
  const markSectionReadRef = useRef(markSectionRead)
  markSectionReadRef.current = markSectionRead

  useEffect(() => {
    if (unread.general) markSectionReadRef.current(pj.id, 'general')
  }, [pj.id, unread.general])

  useEffect(() => {
    if (!unreadKey) return
    const timers = new Map()
    // Tall sections can never reach 30% of their own height, so also accept a large visible slice.
    const isMostlyVisible = e => e.intersectionRatio >= 0.3 || e.intersectionRect.height >= window.innerHeight * 0.4
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const key = entry.target.id.slice(SECTION_ID_PREFIX.length)
        clearTimeout(timers.get(key))
        timers.delete(key)
        if (entry.isIntersecting && isMostlyVisible(entry)) {
          timers.set(key, setTimeout(() => {
            timers.delete(key)
            markSectionReadRef.current(pj.id, key)
          }, DWELL_MS))
        }
      }
    }, { threshold: Array.from({ length: 11 }, (_, i) => i / 10) })
    for (const key of unreadKey.split(',')) {
      const el = document.getElementById(SECTION_ID_PREFIX + key)
      if (el) observer.observe(el)
    }
    return () => {
      observer.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [pj.id, unreadKey])

  const sentinelRef = useRef(null)
  const backBarRef = useRef(null)
  const stickyNavRef = useRef(null)
  const nameRef = useRef(null)
  const [showStickyNav, setShowStickyNav] = useState(false)
  const [showNameInHeader, setShowNameInHeader] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const hasNav = visibleSections.length > 0 || hasDMNotes

  const HEADER_H = 60

  function scrollTo(id) {
    const el = document.getElementById(`${SECTION_ID_PREFIX}${id}`)
    if (!el) return
    const offset = HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + (stickyNavRef.current?.offsetHeight ?? 0)
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
    if (unread[id]) markSectionRead(pj.id, id)
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

  useEffect(() => {
    if (!nameRef.current) return
    const backBarH = backBarRef.current?.offsetHeight ?? 0
    const observer = new IntersectionObserver(
      ([entry]) => setShowNameInHeader(!entry.isIntersecting),
      { threshold: 0, rootMargin: `-${HEADER_H + backBarH}px 0px 0px 0px` }
    )
    observer.observe(nameRef.current)
    return () => observer.disconnect()
  }, [])

  const navButtons = (
    <>
      {visibleSections.map(s => (
        <button
          key={s.id}
          className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-txt-muted hover:text-txt-primary hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
          onClick={() => scrollTo(s.id)}
        >
          {s.label}
          <UnreadDot unread={unread[s.id]} className="ml-1.5 inline-block align-middle" />
        </button>
      ))}
      {hasDMNotes && (
        <button
          className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-accent-dim hover:text-accent-bright hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
          onClick={() => scrollTo('dm')}
        >
          <Lock size={12} className="inline mr-1" />DM
          <UnreadDot unread={unread.dm} className="ml-1.5 inline-block align-middle" />
        </button>
      )}
    </>
  )

  const icon = <Shield size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <div ref={backBarRef} className="flex justify-between items-center mb-7 sticky top-[60px] z-10 bg-[#060606] py-3 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        <span
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{pj.nombre}
        </span>
        {isDM && (
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onDelete}>Eliminar</button>
            <button className={btnSecondary} onClick={onEdit}>Editar</button>
          </div>
        )}
        {isOwnPlayer && (
          <button className={btnSecondary} onClick={onEdit}>Editar</button>
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
        {pj.imagen_url && (
          <LazyImg
            src={pj.imagen_url}
            alt={pj.nombre}
            className="w-full h-full rounded-lg object-contain border border-border-base cursor-zoom-in"
            containerCls="h-[170px] min-w-[110px] max-w-fit flex-shrink-0"
            onClick={() => setLightbox(true)}
          />
        )}
        {lightbox && <ImageLightbox src={pj.imagen_url} alt={pj.nombre} onClose={() => setLightbox(false)} />}
        <div className='flex-1 flex flex-col gap-2 h-fit'>
          <div className="pb-5 border-b border-border-base">
            <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pj.region] || '#6e6e6e' }}>
              Personaje Jugador
            </div>
            <div ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</div>
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
              <div className="flex flex-wrap min-w-fit">{navButtons}</div>
            </div>
          )}
        </div>
      </div>

      {visibleSections.map(({ id, Component }) => (
        <Component key={id} pj={pj} unread={unread[id]} />
      ))}

      {hasDMNotes && (
        <div id="pj-section-dm" className="mt-5 pt-4 border-t-2 border-t-accent">
          <div className="font-exo text-[13px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2">
            <Lock size={12} className="inline mr-1" />Notas DM
            <UnreadDot unread={unread.dm} className="ml-2 inline-block align-middle" />
          </div>
          <div className={detailTextCls}><WikiText text={pj.notas} /></div>
        </div>
      )}

      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}
