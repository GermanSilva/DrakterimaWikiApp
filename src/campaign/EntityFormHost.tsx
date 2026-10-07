import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import FormShell from '../components/FormShell'
import { ENTITY_FORMS, FORM_TITLES } from '../components/forms/entityForms'
import { extractDmNotes, withoutDmNotes, type DmNotesFields, type FlatEntity } from '../data'
import { changedPjFields, changedPjSections } from '../helpers/pjSections'
import { buildPjFormState, toPjPayload } from '../pages/pj/pjFormState'
import { FormPortContext, useFormPort, useUnreadPort, type FormPort, type SesionRef } from '../ports'
import { useCampaign } from './CampaignContext'
import { EntityFormContext, tableOfForm, type EntityFormApi, type EntityFormRequest } from './entityFormContext'
import { useCampaignServices } from './entities/campaignServicesContext'
import { sameIds, useEntityActions } from './entities/useEntityActions'
import { useDmNotes, type DmNotesFieldsState } from './entities/useDmNotes'
import { useEntities } from './entities/useEntities'
import { useVisibility } from './entities/useVisibility'
import { useToast } from './toastContext'
import { changedFields } from './changedFields'
import { pickOwnerPatch, STAMPABLE_SECTIONS } from './pjOwnerFields'

const NOTE_KEYS = ['notas', 'secreto', 'ganchos'] as const

interface SectionStamps {
  sections: string[]
  /** `{ [section]: ISO time }`: merged into `pjs.sections_updated`. */
  stamps: Record<string, string>
}

/**
 * Sections of a character a save changes, stamped with the time of the write. DM notes and visibility are
 * NOT stamped: `sections_updated` is readable by every member, so a "dm" stamp would tell players when the DM
 * edited a note (the hub derives that dot from the DM-only notes row), and a visibility change is no content change.
 */
function pjSectionStamps(seed: Seed, patch: Record<string, unknown>): SectionStamps {
  const sections = (changedPjSections(seed.entity, { ...seed.entity, ...patch }) as string[]).filter((k) => STAMPABLE_SECTIONS.includes(k))
  const now = new Date().toISOString()
  return { sections, stamps: Object.fromEntries(sections.map((k) => [k, now])) }
}

/**
 * Form values whose seeded default derives from another field. When the source changed in this save, the derived
 * value is written explicitly: the diff baseline is built from the OLD row, so it would otherwise treat the
 * (now stale) default as "unedited" and drop it. Today: the current HP defaults to the maximum.
 */
function withDerivedDefaults(patch: Record<string, unknown>, flat: Record<string, unknown>): Record<string, unknown> {
  if ('stat_hp' in patch && !('stat_hp_current' in patch) && flat.stat_hp_current !== undefined) {
    return { ...patch, stat_hp_current: flat.stat_hp_current }
  }
  return patch
}

/** The payload the character form would produce from the untouched seed (what "no edits" looks like). */
function pjBaseline(seed: Seed, port: FormPort): Record<string, unknown> {
  const item = { ...seed.entity, ...seed.dm, visibilidad: seed.visibleTo }
  return toPjPayload(buildPjFormState(item, { regions: port.regions, characterFields: port.characterFields }), seed.entity.id)
}

/** The DM who just saved notes has seen them: clear their "dm" dot (stamped by the notes row itself). */
function markDmSeen(unread: ReturnType<typeof useUnreadPort>, id: number, stamp: string | undefined): void {
  try {
    unread.markRead('pjs', id, stamp, 'dm')
  } catch (err) {
    console.error('No se pudo marcar como leído', err)
  }
}

/** The saver has seen their own change: clear the dots of the sections it stamped. */
function markSectionsSeen(unread: ReturnType<typeof useUnreadPort>, id: number, { sections, stamps }: SectionStamps): void {
  for (const section of sections) {
    try {
      unread.markRead('pjs', id, stamps[section], section)
    } catch (err) {
      console.error('No se pudo marcar como leído', err)
    }
  }
}

interface Seed {
  entity: FlatEntity
  dm: DmNotesFieldsState
  visibleTo: number[]
}

/**
 * Hub host of the shared entity forms: opens the SAME form components and modal frame as the legacy
 * app, seeded with the full entity (+ DM notes and `visible_to` for the DM), and turns their `save`
 * into create/update calls that split the form value into entity fields, DM notes and visibility.
 *
 * An edit form opens only after everything it seeds from has loaded: opening with the DM notes still
 * missing would let a save overwrite them with ''. The seed is latched, so a realtime update of the
 * entity while the form is open never resets what the DM typed; the version the DM started from is
 * the optimistic `base`, so a concurrent edit surfaces as a conflict instead of being overwritten.
 *
 * Characters (`pjs`) add two things: every write stamps `sections_updated` for the sections it changed (the
 * unread dots; the saver's own dots are cleared at once), and a player editing the character they own is
 * an OWNER save: only the identity fields the database guard allows are ever sent, never DM notes or
 * visibility, whatever the form state holds.
 */
function EntityFormHost({ request, onClose }: { request: EntityFormRequest; onClose: () => void }) {
  const { isDM } = useCampaign()
  const { showToast } = useToast()
  const unread = useUnreadPort()
  const table = tableOfForm(request.type)
  const isPj = table === 'pjs'
  const ownerMode = isPj && !isDM
  const id = request.id ?? null
  const [seed, setSeed] = useState<Seed | null>(null)
  // a form that created an entity with failed follow-ups continues as an EDIT of that entity
  const editing = id !== null || seed !== null
  const openedAsEdit = id !== null
  const actions = useEntityActions(table)

  const list = useEntities(table, { enabled: openedAsEdit })
  const entity = useMemo(() => (openedAsEdit ? (list.items.find((e) => e.id === id) ?? null) : null), [openedAsEdit, list.items, id])
  const dm = useDmNotes(table, id)
  const vis = useVisibility(table, openedAsEdit ? [id] : [])
  const needsSesiones = table === 'sesiones'
  const sesionesList = useEntities('sesiones', { enabled: needsSesiones })

  const dmReady = !isDM || !openedAsEdit || dm.status === 'ready' || dm.status === 'idle'
  const visReady = !isDM || !openedAsEdit || vis.status === 'ready' || vis.status === 'idle'
  const sesionesReady = !needsSesiones || !sesionesList.loading
  // Load problems only matter BEFORE the seed is latched: once the form is open, a transient re-list
  // error or a row that vanished from the list must not close it under the user's hands.
  const loadFailed = !seed && openedAsEdit && (dm.status === 'error' || vis.status === 'error' || !!list.error)
  const missing = !seed && openedAsEdit && !list.loading && !entity
  const saving = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => {
    if (seed || !openedAsEdit || !entity || !dmReady || !visReady) return
    // Latches the form's initial values exactly once, after everything it seeds from has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed({ entity, dm: dm.fields, visibleTo: vis.visibility[entity.id] ?? [] })
  }, [seed, openedAsEdit, entity, dmReady, visReady, dm.fields, vis.visibility])

  useEffect(() => {
    if (loadFailed) {
      showToast('No pudimos cargar el formulario. Intentá de nuevo.', 'error')
      onClose()
    } else if (missing) {
      showToast('Ese registro ya no existe.', 'error')
      onClose()
    }
  }, [loadFailed, missing, showToast, onClose])

  const basePort = useFormPort()
  const port = useMemo(
    () => ({
      ...basePort,
      sesiones: needsSesiones
        ? sesionesList.items.map<SesionRef>((s) => ({
            id: s.id,
            numero: s.numero as number | null,
            orden: s.orden as number | null,
            tipo: s.tipo as string | null,
            titulo: s.titulo as string | undefined,
          }))
        : basePort.sesiones,
    }),
    [basePort, needsSesiones, sesionesList.items],
  )

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      const visibilidad = data.visibilidad
      const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id' && k !== 'visibilidad'))
      // an owner never writes DM notes or visibility, even if the form state carries them
      const notes: DmNotesFields = ownerMode ? {} : extractDmNotes(rest)
      const flat = withoutDmNotes(rest)
      const visibleTo = !ownerMode && Array.isArray(visibilidad) ? (visibilidad as number[]) : undefined
      let saved: FlatEntity | null = null
      if (seed) {
        const dmChanged = Object.fromEntries(
          NOTE_KEYS.filter((k) => notes[k] !== undefined && notes[k] !== seed.dm[k]).map((k) => [k, notes[k]]),
        )
        // A character is diffed against what its form was SEEDED with, not against the raw row: defaults the row
        // lacks (stat_hp_current from stat_hp, the proficiency bonus, ...) are not edits and never travel.
        const changed = isPj ? withDerivedDefaults(changedPjFields(pjBaseline(seed, basePort), flat), flat) : changedFields(seed.entity, flat)
        const patch: Record<string, unknown> = ownerMode ? pickOwnerPatch(changed) : changed
        const visChanged = visibleTo !== undefined && !sameIds(visibleTo, seed.visibleTo)
        if (Object.keys(patch).length === 0 && Object.keys(dmChanged).length === 0 && !visChanged) {
          onClose() // nothing to write
          return
        }
        const stamped = isPj ? pjSectionStamps(seed, patch) : null
        if (stamped && stamped.sections.length > 0) patch.sections_updated = stamped.stamps
        const outcome = await actions.update(seed.entity.id, patch, {
          base: seed.entity,
          dmNotes: dmChanged,
          visibleTo: visChanged ? visibleTo : undefined,
          currentVisibleTo: seed.visibleTo,
        })
        saved = outcome?.entity ?? null
        if (outcome && stamped) markSectionsSeen(unread, outcome.entity.id, stamped)
        if (outcome && isPj && outcome.dmNotes && Object.keys(dmChanged).length > 0) markDmSeen(unread, outcome.entity.id, outcome.dmNotes.updated_at)
        if (outcome && outcome.warnings.length > 0) {
          // The row IS saved but a follow-up failed: keep the form open for a retry, re-based on the
          // saved version so the retry does not conflict with our own write.
          setSeed((current) => (current ? { ...current, entity: outcome.entity } : current))
          request.onSaved?.(outcome.entity)
          return
        }
      } else {
        const filled = Object.fromEntries(Object.entries(notes).filter(([, v]) => v !== ''))
        const created: SectionStamps | null = isPj ? { sections: ['general'], stamps: { general: new Date().toISOString() } } : null
        const outcome = await actions.create(created ? { ...flat, sections_updated: created.stamps } : flat, { dmNotes: filled, visibleTo })
        saved = outcome?.entity ?? null
        if (outcome && created) markSectionsSeen(unread, outcome.entity.id, created)
        if (outcome && outcome.warnings.length > 0) {
          // Created, but a follow-up failed: continue as an EDIT of the created row so a retry updates
          // it (never creates a duplicate). What did not reach the server stays "to send".
          setSeed({
            entity: outcome.entity,
            dm: outcome.dmNotes
              ? { notas: outcome.dmNotes.notas, secreto: outcome.dmNotes.secreto, ganchos: outcome.dmNotes.ganchos }
              : { notas: '', secreto: '', ganchos: '' },
            visibleTo: [],
          })
          request.onSaved?.(outcome.entity)
          return
        }
      }
      if (saved) {
        request.onSaved?.(saved)
        onClose()
      } // else: the toast says why and the form stays open
    },
    [seed, actions, request, onClose, isPj, ownerMode, unread, basePort],
  )

  const onSave = useCallback(
    async (_type: string, data: Record<string, unknown>) => {
      if (saving.current) return // double submit: the first one is still in flight
      saving.current = true
      setIsSaving(true)
      try {
        await save(data)
      } finally {
        saving.current = false
        setIsSaving(false)
      }
    },
    [save],
  )

  const onRemove = useCallback(
    async (_type: string, removeId: number) => {
      if (ownerMode) return // an owner can never delete their character (the form has no such button)
      if (!confirm('¿Eliminar este registro?')) return
      if (await actions.remove(removeId)) {
        request.onRemoved?.()
        onClose()
      }
    },
    [actions, request, onClose, ownerMode],
  )

  // Once seeded the form stays mounted whatever the loaders do (a refetch must not unmount typed text).
  if (editing ? !seed : !sesionesReady) return null

  const titles = FORM_TITLES[request.type]
  const item = seed ? { ...seed.entity, ...seed.dm, visibilidad: seed.visibleTo } : null
  return (
    <FormPortContext.Provider value={port}>
      <FormShell
        type={request.type}
        title={seed ? titles[1] : titles[0]}
        FormComponent={ENTITY_FORMS[request.type]}
        item={item}
        isPJForm={isPj}
        saving={isSaving}
        onSave={onSave}
        onRemove={onRemove}
        onClose={onClose}
      />
    </FormPortContext.Provider>
  )
}

/** Provides `useEntityForm()` and renders the open form (if any) above the page. */
export function EntityFormProvider({ children }: { children: ReactNode }) {
  const { isDM, myCharacterIds } = useCampaign()
  const { campaignId } = useCampaignServices()
  const [open, setOpen] = useState<{ campaignId: string; request: EntityFormRequest; nonce: number } | null>(null)
  const nonce = useRef(0)

  const closeForm = useCallback(() => setOpen(null), [])
  const openForm = useCallback(
    (request: EntityFormRequest) => {
      // a player may only edit a character they own (creating or editing any other record is DM only)
      const ownsIt = request.type === 'pjs' && request.id != null && myCharacterIds.includes(request.id)
      if (!isDM && !ownsIt) return
      nonce.current += 1
      setOpen({ campaignId, request, nonce: nonce.current })
    },
    [isDM, myCharacterIds, campaignId],
  )
  const api = useMemo<EntityFormApi>(() => ({ openForm, closeForm }), [openForm, closeForm])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const current = open && open.campaignId === campaignId ? open : null
  return (
    <EntityFormContext.Provider value={api}>
      {children}
      {/* keyed by table + id + request counter: a new openForm never inherits a previous seed or in-flight save */}
      {current && (
        <EntityFormHost
          key={`${tableOfForm(current.request.type)}:${current.request.id ?? 'new'}:${current.nonce}`}
          request={current.request}
          onClose={closeForm}
        />
      )}
    </EntityFormContext.Provider>
  )
}
