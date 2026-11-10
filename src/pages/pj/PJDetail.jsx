import { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { DND5E_PROFILE } from '../../campaign/system/systemProfile'
import { identityTag } from './pjIdentity'
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
import { SectionIndex, SectionPicker } from './SectionIndex'
import KeyFacts from './KeyFacts'
import { roleFacts } from './pjKeyFacts'
import { resolveCard } from '../../campaign/system/sheet/card'
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
import SheetView from '../../campaign/system/sheet/SheetView'
import { resolveSheet } from '../../campaign/system/sheet/resolveSheet'

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
/** While a jump scrolls smoothly, the scroll spy must not move the current section through the ones in between. */
const SPY_PAUSE_MS = 900

/** Replaces the hash with a section key, keeping the router's history state and adding no history entry (S2). */
function replaceHash(id) {
  if (window.location.hash !== `#${id}`) window.history.replaceState(window.history.state, '', `#${id}`)
}

/** The visible sheet sections as index groups, one per category, in sheet order. */
function categoryGroups(sections) {
  const groups = []
  for (const s of sections) {
    const last = groups[groups.length - 1]
    if (last && last.key === s.categoryKey) last.entries.push({ id: s.key, label: s.label })
    else groups.push({ key: s.categoryKey, label: s.category, entries: [{ id: s.key, label: s.label }] })
  }
  return groups
}

/**
 * Character sheet (header with key facts, side index by category with unread dots, the sections, DM notes, player notes).
 * Every section is reachable as `#<section key>` (odd/tasks/ficha-indice-lateral.md S1-S7).
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
 * @param {import('../../campaign/system/systemProfile').SystemProfile} [props.system] system document of the campaign: its built-ins name the identity tags and its sheet blocks decide which sections exist (default: D&D 5e)
 * @param {import('../../campaign/system/sheet/sheetModel').Sheet | null} [props.sheet] validated sheet of the campaign: when given, the sections are drawn from it instead of the fixed D&D ones (the hub passes it whenever the stored sheet is valid; the legacy app never does)
 * @param {import('../../data').LinkedAction[]} [props.linkedActions] collection entries the character links (S36): they join the rows of their Habilidad table in the sheet view, after the stored ones
 * @param {string} [props.motivoLabel] title of the narrative `motivo` section (the narrative section defaults to "Motivación")
 */
export default function PJDetail({ pj, notas = '', dmStamp = undefined, isDM = false, back, actions = null, regionTag = null, regionColor, customFields = LEGACY_CHARACTER_FIELDS, motivoLabel, system = DND5E_PROFILE, sheet = null, linkedActions = undefined }) {
  const unreadPort = useUnreadPort()

  const resolved = useMemo(() => (sheet ? resolveSheet(sheet, pj, linkedActions) : null), [sheet, pj, linkedActions])
  const sheetSections = resolved ? resolved.sections.filter(s => !s.empty) : null
  const visibleSections = sheetSections
    ? sheetSections.map(s => ({ id: s.key, label: s.label }))
    : SECTIONS.filter(s => system.character.sections[s.id] && s.show(pj))
  const { builtins } = system.character
  const identity = identityTag(pj, builtins)
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

  const pickerRef = useRef(null)
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  const [lightbox, setLightbox] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [active, setActive] = useState(null)
  const [missing, setMissing] = useState(null)
  const [stickyTop, setStickyTop] = useState(HEADER_H + 64)
  const spyPausedUntil = useRef(0)

  useLayoutEffect(() => {
    setStickyTop(HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + 8)
  }, [backBarRef])

  const withUnread = entries => entries.map(e => ({ ...e, unread: unread[e.id] }))
  const indexGroups = [
    ...(sheetSections
      ? categoryGroups(sheetSections)
      : visibleSections.length > 0 ? [{ key: 'ficha', label: 'Ficha', entries: visibleSections.map(s => ({ id: s.id, label: s.label })) }] : []),
    { key: 'notas', label: 'Notas', entries: [...(hasDMNotes ? [{ id: 'dm', label: 'Notas del DM', dm: true }] : []), { id: 'notas', label: 'Notas del jugador' }] },
  ].map(g => ({ ...g, entries: withUnread(g.entries) }))
  const indexIds = indexGroups.flatMap(g => g.entries.map(e => e.id))
  const idsKey = indexIds.join(',')

  const wroteHashRef = useRef(null)
  const writeHash = id => {
    replaceHash(id)
    wroteHashRef.current = id
  }
  // Leaving the detail removes the hash it wrote: the legacy app opens another character under the same URL.
  useEffect(() => () => {
    if (wroteHashRef.current !== null && window.location.hash === `#${wroteHashRef.current}`) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
  }, [])

  /**
   * Go to a section: expand it, scroll to it below the sticky bars, mark it current and put its key in the hash. A click in
   * the index reads the section at once (as the old nav did); arriving by link leaves it to the 1.5 s visible rule (S4).
   */
  function scrollTo(id, { markRead = true } = {}) {
    setReveal(prev => ({ key: id, n: (prev?.n ?? 0) + 1 }))
    setActive(id)
    setMissing(null)
    writeHash(id)
    const el = document.getElementById(`${SECTION_ID_PREFIX}${id}`)
    if (!el) return
    spyPausedUntil.current = Date.now() + SPY_PAUSE_MS
    const offset = HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + (pickerRef.current?.offsetHeight ?? 0) + 8
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    if (markRead && unread[id]) markSectionReadRef.current(pj.id, id)
  }
  const scrollToRef = useRef(scrollTo)
  scrollToRef.current = scrollTo
  const idsRef = useRef(indexIds)
  idsRef.current = indexIds

  // Arriving with #key (or the hash changing while here): open that section, or say it no longer exists (S2-S4).
  useEffect(() => {
    const open = () => {
      const raw = window.location.hash.slice(1)
      let key = raw
      try {
        key = decodeURIComponent(raw)
      } catch {
        // a malformed escape (#50%) is just a key that does not exist
      }
      if (!key) return
      if (idsRef.current.includes(key)) scrollToRef.current(key, { markRead: false })
      else setMissing(key)
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [pj.id])

  // Scroll spy: the topmost section under the sticky bars is the current one, and its key replaces the hash.
  useEffect(() => {
    const elements = idsKey.split(',').map(id => document.getElementById(SECTION_ID_PREFIX + id)).filter(Boolean)
    if (elements.length === 0) return
    const tops = new Map()
    // below the sticky bars, the narrow-screen picker included (0 on wide screens, where it is hidden)
    const offset = HEADER_H + (backBarRef.current?.offsetHeight ?? 0) + (pickerRef.current?.offsetHeight ?? 0)
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const key = entry.target.id.slice(SECTION_ID_PREFIX.length)
        if (entry.isIntersecting) tops.set(key, entry.boundingClientRect.top)
        else tops.delete(key)
      }
      if (Date.now() < spyPausedUntil.current) return
      const first = [...tops.entries()].sort((a, b) => a[1] - b[1])[0]
      if (!first) return
      setActive(first[0])
      writeHash(first[0])
    }, { rootMargin: `-${offset}px 0px -65% 0px` })
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [idsKey, backBarRef])

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
          <div className="pb-5 border-b border-border-base flex flex-wrap items-end justify-between gap-4">
           <div>
            <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: regionColor || '#6e6e6e' }}>
              Personaje Jugador
            </div>
            <h1 ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</h1>
            <div className="font-exo text-[16px] font-semibold uppercase text-txt-muted -mt-1">{pj.jugador}</div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {identity && <Tag cls="pj" text={identity} />}
              {builtins.raza.enabled && pj.raza && <Tag cls="neutral" text={pj.raza} />}
              {pj.region && regionTag}
              {pj.alineamiento && <Tag cls="neutral" text={pj.alineamiento} />}
              {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
              {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
            </div>
           </div>
            <KeyFacts
              facts={[...roleFacts(sheet, pj, builtins.nivel), ...(sheet?.card ? resolveCard(sheet, pj).pinned.filter(p => !p.dmOnly || isDM) : [])]}
              className="max-w-[440px]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-8 items-start mt-6 max-lg:grid-cols-1 max-lg:gap-0">
        <aside
          className="sticky overflow-y-auto pr-3 border-r border-border-base max-lg:hidden"
          style={{ top: stickyTop, maxHeight: `calc(100vh - ${stickyTop + 16}px)` }}
        >
          <SectionIndex groups={indexGroups} active={active} onGo={scrollTo} label="Índice de la ficha" />
        </aside>
        <div className="min-w-0">
          <div ref={pickerRef} className="lg:hidden sticky z-10 mb-2" style={{ top: stickyTop - 8 }}>
            <SectionPicker groups={indexGroups} active={active} onGo={scrollTo} />
          </div>
          {missing && (
            <p role="status" className="mb-4 px-3.5 py-2.5 border border-dashed border-border-light text-[13px] italic text-txt-secondary">
              Esa sección («{missing}») ya no está en la ficha. Te dejamos al principio.
            </p>
          )}

          {resolved
            ? <SheetView key={pj.id} resolved={resolved} unread={unread} reveal={reveal} storageKey={`pjs:${pj.id}`} />
            : visibleSections.map(({ id, Component }) => (
              <Component key={id} pj={pj} unread={unread[id]} customFields={customFields} motivoLabel={motivoLabel} />
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

          <div id="pj-section-notas">
            <PlayerNotes entityType="pjs" entityId={pj.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
