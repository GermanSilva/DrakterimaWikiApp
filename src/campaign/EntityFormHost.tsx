import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import FormShell from '../components/FormShell'
import { ENTITY_FORMS, FORM_TITLES } from '../components/forms/entityForms'
import { extractDmNotes, withoutDmNotes, type FlatEntity } from '../data'
import { FormPortContext, useFormPort, type SesionRef } from '../ports'
import { useCampaign } from './CampaignContext'
import { EntityFormContext, tableOfForm, type EntityFormApi, type EntityFormRequest } from './entityFormContext'
import { useCampaignServices } from './entities/campaignServicesContext'
import { sameIds, useEntityActions } from './entities/useEntityActions'
import { useDmNotes, type DmNotesFieldsState } from './entities/useDmNotes'
import { useEntities } from './entities/useEntities'
import { useVisibility } from './entities/useVisibility'
import { useToast } from './toastContext'
import { changedFields } from './changedFields'

const NOTE_KEYS = ['notas', 'secreto', 'ganchos'] as const

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
 */
function EntityFormHost({ request, onClose }: { request: EntityFormRequest; onClose: () => void }) {
  const { isDM } = useCampaign()
  const { showToast } = useToast()
  const table = tableOfForm(request.type)
  const id = request.id ?? null
  const editing = id !== null
  const actions = useEntityActions(table)

  const list = useEntities(table, { enabled: editing })
  const entity = useMemo(() => (editing ? (list.items.find((e) => e.id === id) ?? null) : null), [editing, list.items, id])
  const dm = useDmNotes(table, id)
  const vis = useVisibility(table, editing ? [id] : [])
  const needsSesiones = table === 'sesiones'
  const sesionesList = useEntities('sesiones', { enabled: needsSesiones })

  const dmReady = !isDM || !editing || dm.status === 'ready' || dm.status === 'idle'
  const visReady = !isDM || !editing || vis.status === 'ready' || vis.status === 'idle'
  const sesionesReady = !needsSesiones || !sesionesList.loading
  const [seed, setSeed] = useState<Seed | null>(null)
  // Load problems only matter BEFORE the seed is latched: once the form is open, a transient re-list
  // error or a row that vanished from the list must not close it under the user's hands.
  const loadFailed = !seed && editing && (dm.status === 'error' || vis.status === 'error' || !!list.error)
  const missing = !seed && editing && !list.loading && !entity
  const saving = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => {
    if (seed || !editing || !entity || !dmReady || !visReady) return
    // Latches the form's initial values exactly once, after everything it seeds from has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed({ entity, dm: dm.fields, visibleTo: vis.visibility[entity.id] ?? [] })
  }, [seed, editing, entity, dmReady, visReady, dm.fields, vis.visibility])

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
      const notes = extractDmNotes(rest)
      const flat = withoutDmNotes(rest)
      const visibleTo = Array.isArray(visibilidad) ? (visibilidad as number[]) : undefined
      let saved: FlatEntity | null = null
      if (seed) {
        const dmChanged = Object.fromEntries(
          NOTE_KEYS.filter((k) => notes[k] !== undefined && notes[k] !== seed.dm[k]).map((k) => [k, notes[k]]),
        )
        const patch = changedFields(seed.entity, flat)
        const visChanged = visibleTo !== undefined && !sameIds(visibleTo, seed.visibleTo)
        if (Object.keys(patch).length === 0 && Object.keys(dmChanged).length === 0 && !visChanged) {
          onClose() // nothing to write
          return
        }
        const outcome = await actions.update(seed.entity.id, patch, {
          base: seed.entity,
          dmNotes: dmChanged,
          visibleTo: visChanged ? visibleTo : undefined,
          currentVisibleTo: seed.visibleTo,
        })
        saved = outcome?.entity ?? null
        if (outcome && outcome.warnings.length > 0) {
          // The row IS saved but a follow-up failed: keep the form open for a retry, re-based on the
          // saved version so the retry does not conflict with our own write.
          setSeed((current) => (current ? { ...current, entity: outcome.entity } : current))
          request.onSaved?.(outcome.entity)
          return
        }
      } else {
        const filled = Object.fromEntries(Object.entries(notes).filter(([, v]) => v !== ''))
        const outcome = await actions.create(flat, { dmNotes: filled, visibleTo })
        saved = outcome?.entity ?? null
      }
      if (saved) {
        request.onSaved?.(saved)
        onClose()
      } // else: the toast says why and the form stays open
    },
    [seed, actions, request, onClose],
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
      if (!confirm('¿Eliminar este registro?')) return
      if (await actions.remove(removeId)) {
        request.onRemoved?.()
        onClose()
      }
    },
    [actions, request, onClose],
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
  const { isDM } = useCampaign()
  const { campaignId } = useCampaignServices()
  const [open, setOpen] = useState<{ campaignId: string; request: EntityFormRequest } | null>(null)

  const closeForm = useCallback(() => setOpen(null), [])
  const openForm = useCallback(
    (request: EntityFormRequest) => {
      if (!isDM) return
      setOpen({ campaignId, request })
    },
    [isDM, campaignId],
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

  const current = open && open.campaignId === campaignId ? open.request : null
  return (
    <EntityFormContext.Provider value={api}>
      {children}
      {current && <EntityFormHost request={current} onClose={closeForm} />}
    </EntityFormContext.Provider>
  )
}
