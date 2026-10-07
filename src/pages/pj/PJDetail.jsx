import { useRef, useState, useEffect } from 'react'
import { useUnreadPort } from '../../ports'
import useStickyTitle, { HEADER_H } from '../../hooks/useStickyTitle'
import { Tag } from '../../components/Shared'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import ImageLightbox from '../../components/ImageLightbox'
import UnreadDot from '../../components/UnreadDot'
import { isSectionUnreadVia } from '../../helpers/pjSections'
import { LEGACY_CHARACTER_FIELDS } from '../../helpers/pjCustomFields'
import { SECTION_SHOW } from './pjConstants'
import LazyImg from '../../components/LazyImg'
import { Lock, Shield } from 'lucide-react'
import { detailTextCls } from '../../constants'
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

/**
 * Character sheet (header, section nav with unread dots, the sections, DM notes, player notes).
 * Host-agnostic: the host passes the DM notes text, the viewer's role and the slots that differ
 * (back link, edit/delete buttons, region tag); unread state goes through the UnreadPort.
 *
 * @param {object} props
 * @param {object} props.pj flat character (the DM notes are NOT part of it)
 * @param {string} [props.notas] DM-private notes ('' for players / none)
 * @param {string | null} [props.dmStamp] hub: when the DM notes last changed (their own row); legacy leaves it undefined and uses sections_updated.dm
 * @param {boolean} [props.isDM]
 * @param {import('react').ReactNode} props.back the "← Volver" control (button or link)
 * @param {import('react').ReactNode} [props.actions] edit / delete buttons, already filtered by role
 * @param {import('react').ReactNode} [props.regionTag]
 * @param {string} [props.regionColor] CSS colour of the "Personaje Jugador" eyebrow
 * @param {{key: string, label: string, flat?: boolean}[]} [props.customFields] campaign character fields
 */
export default function PJDetail({ pj, notas = '', dmStamp = undefined, isDM = false, back, actions = null, regionTag = null, regionColor, customFields = LEGACY_CHARACTER_FIELDS }) {
  const unreadPort = useUnreadPort()

  const visibleSections = SECTIONS.filter(s => s.show(pj))
  const hasDMNotes = isDM && !!notas

  const unread = Object.fromEntries(
    [...visibleSections.map(s => s.id), 'dm', 'general'].map(k => [k, isSectionUnreadVia(unreadPort, pj, k, hasDMNotes, dmStamp)])
  )
  const unreadKey = Object.keys(unread).filter(k => unread[k] && k !== 'general').join(',')
  const unreadPortRef = useRef(unreadPort)
  unreadPortRef.current = unreadPort
  const markSectionRead = (id, key) =>
    unreadPortRef.current.markRead('pjs', id, key === 'dm' && dmStamp !== undefined ? dmStamp : pj.sections_updated?.[key], key)
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
  const stickyNavRef = useRef(null)
  const [showStickyNav, setShowStickyNav] = useState(false)
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  const [lightbox, setLightbox] = useState(false)
  const hasNav = visibleSections.length > 0 || hasDMNotes

  function scrollTo(id) {
    const el = document.getElementById(`${SECTION_ID_PREFIX}${id}`)
    if (!el) return
    const offset = HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + (stickyNavRef.current?.offsetHeight ?? 0)
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
    if (unread[id]) markSectionReadRef.current(pj.id, id)
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
        {back}
        <span
          aria-hidden="true"
          className="flex-1 font-exo text-[13px] font-bold uppercase tracking-[0.1em] text-txt-primary leading-none truncate px-4 pointer-events-none"
          style={{ opacity: showNameInHeader ? 1 : 0, transition: 'opacity 0.2s ease' }}
        >
          {icon}{pj.nombre}
        </span>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
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
            <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: regionColor || '#6e6e6e' }}>
              Personaje Jugador
            </div>
            <h1 ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</h1>
            <div className="font-exo text-[16px] font-semibold uppercase text-txt-muted -mt-1">{pj.jugador}</div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Tag cls="pj" text={`${pj.clase || '?'} - Nv. ${pj.nivel || 1}`} />
              {pj.raza && <Tag cls="neutral" text={pj.raza} />}
              {pj.region && regionTag}
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
        <Component key={id} pj={pj} unread={unread[id]} customFields={customFields} />
      ))}

      {hasDMNotes && (
        <div id="pj-section-dm" className="mt-5 pt-4 border-t-2 border-t-accent">
          <div className="font-exo text-[13px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2">
            <Lock size={12} className="inline mr-1" />Notas DM
            <UnreadDot unread={unread.dm} className="ml-2 inline-block align-middle" />
          </div>
          <div className={detailTextCls}><WikiText text={notas} /></div>
        </div>
      )}

      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}
