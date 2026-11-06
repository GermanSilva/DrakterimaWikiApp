import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth'
import { useHubData } from '../app/DataContext'
import { btnNeutral, btnPrimary, btnSecondary, inputCls, labelCls } from '../constants'
import { describeDataError } from '../campaign/entities/errorMessages'
import { ConfirmDialog } from '../campaign/sections/ajustes/ConfirmDialog'
import { SystemNameDialog } from '../campaign/sections/ajustes/SystemNameDialog'
import { KIND_LABEL, lineageText, systemDate } from '../campaign/sections/ajustes/systemLabels'
import type { CampaignWithRole, SystemSummary } from '../data'
import { useIsHubOwner } from './useIsHubOwner'
import { useLoaded } from './useLoaded'
import { useMyCampaigns } from './useMyCampaigns'

const NO_SYSTEMS: SystemSummary[] = []
const KIND_RANK = { origin: 0, homebrew: 1, frozen: 2 } as const

type Dialog = { kind: 'create'; campaignId: string } | { kind: 'rename' | 'promote' | 'archive'; system: SystemSummary } | null

/** Hub-owner-only page (the owner check is a hint, the database refuses everybody else): everybody else sees the not-found page. */
export function SystemsPage() {
  const { isOwner, ready } = useIsHubOwner()
  if (!ready) {
    return (
      <p role="status" className="text-sm text-txt-muted">
        Cargando…
      </p>
    )
  }
  if (!isOwner) {
    return (
      <div className="max-w-sm mx-auto pt-16 text-center">
        <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Página no encontrada</h1>
        <p className="text-sm text-txt-secondary mb-5">La dirección que abriste no existe.</p>
        <Link to="/" className={btnSecondary}>
          Ir al inicio
        </Link>
      </div>
    )
  }
  return <SystemsAdmin />
}

function SourceCampaign({ system, campaigns }: { system: SystemSummary; campaigns: CampaignWithRole[] }) {
  const campaign = system.campaign_id ? campaigns.find((c) => c.id === system.campaign_id) : undefined
  return <p className="text-xs text-txt-muted">Campaña de origen: {campaign ? campaign.name : 'ya no existe'}</p>
}

type CountState = { status: 'idle' | 'loading' } | { status: 'ready'; count: number } | { status: 'error'; message: string }

/** Reads the catalogue size on demand (one request per click): the hub owner can read every catalogue. */
function ActionCount({ system }: { system: SystemSummary }) {
  const data = useHubData()
  const [state, setState] = useState<CountState>({ status: 'idle' })
  async function read() {
    setState({ status: 'loading' })
    try {
      const actions = await data.getSystemActions(system.id)
      setState({ status: 'ready', count: actions.length })
    } catch (error) {
      setState({ status: 'error', message: describeDataError(error, 'No pudimos leer las acciones de este sistema.') })
    }
  }
  if (state.status === 'ready') return <p className="text-xs text-txt-secondary">{state.count === 1 ? '1 acción compartida' : `${state.count} acciones compartidas`}</p>
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-xs text-accent-bright">
        {state.message}
      </p>
    )
  }
  return (
    <button
      type="button"
      className="text-xs text-accent-bright underline text-left disabled:opacity-50"
      aria-label={`Ver acciones compartidas de ${system.name}`}
      disabled={state.status === 'loading'}
      onClick={read}
    >
      Ver acciones compartidas
    </button>
  )
}

function SystemsAdmin() {
  const data = useHubData()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const systems = useLoaded(userId, () => data.listAllSystems(), NO_SYSTEMS)
  const { campaigns } = useMyCampaigns()
  const [campaignId, setCampaignId] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [rowFailure, setRowFailure] = useState<{ id: string; message: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const sorted = [...systems.value].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
  const selected = campaigns.some((c) => c.id === campaignId) ? campaignId : (campaigns[0]?.id ?? '')

  async function unarchive(system: SystemSummary) {
    if (busy) return
    setBusy(system.id)
    setRowFailure(null)
    try {
      await data.archiveSystem(system.id, false)
      systems.reload()
    } catch (error) {
      setRowFailure({ id: system.id, message: describeDataError(error, 'No se pudo desarchivar el sistema. Intentá de nuevo.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="brand-gradient-text font-exo text-2xl font-bold tracking-[0.15em] uppercase">Sistemas</h1>
        <Link to="/" className={btnSecondary}>
          Volver a mis campañas
        </Link>
      </div>
      <p className="text-sm text-txt-secondary mb-6">
        Un Sistema Origen es una base que los DM pueden elegir al solicitar una campaña. La campaña recibe una copia: cambiar o archivar el origen después no altera las campañas ya creadas.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-8">
        <div className="min-w-[220px]">
          <label htmlFor="origin-campaign" className={labelCls}>
            Campaña
          </label>
          <select id="origin-campaign" className={inputCls} value={selected} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={btnPrimary} disabled={selected === ''} onClick={() => setDialog({ kind: 'create', campaignId: selected })}>
          Crear Sistema Origen
        </button>
      </div>

      {systems.status === 'error' && (
        <div role="alert" className="mb-4 text-sm text-accent-bright">
          <p className="mb-2">No pudimos cargar los sistemas.</p>
          <button type="button" className={btnSecondary} onClick={systems.reload}>
            Reintentar
          </button>
        </div>
      )}
      {systems.status === 'loading' && (
        <p role="status" className="text-sm text-txt-muted">
          Cargando los sistemas…
        </p>
      )}
      {systems.status === 'ready' && sorted.length === 0 && <p className="text-sm text-txt-muted">Todavía no hay sistemas.</p>}
      {sorted.length > 0 && (
        <ul aria-label="Sistemas" className="grid gap-3">
          {sorted.map((s) => {
            const lineage = lineageText(s, systems.value)
            const archived = s.archived_at !== null
            return (
              <li key={s.id} className="flex items-center gap-4 bg-bg-card border border-border-base p-4">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="font-exo text-sm font-semibold tracking-[0.08em] text-txt-primary break-words">{s.name}</p>
                  <p className="flex items-center gap-2 flex-wrap">
                    <span className="font-exo text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 border border-border-light text-txt-secondary">{KIND_LABEL[s.kind]}</span>
                    {archived && <span className="font-exo text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 border border-accent-dim text-accent-bright">Archivado</span>}
                  </p>
                  <SourceCampaign system={s} campaigns={campaigns} />
                  {lineage && <p className="text-xs text-txt-muted">{lineage}</p>}
                  <p className="text-xs text-txt-muted">{`Creado el ${systemDate(s.created_at)}`}</p>
                  <ActionCount system={s} />
                  {rowFailure?.id === s.id && (
                    <p role="alert" className="text-xs text-accent-bright">
                      {rowFailure.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <button type="button" className={btnNeutral} aria-label={`Renombrar ${s.name}`} onClick={() => setDialog({ kind: 'rename', system: s })}>
                    Renombrar
                  </button>
                  {s.kind !== 'origin' && (
                    <button type="button" className={btnNeutral} aria-label={`Promover ${s.name} a origen`} onClick={() => setDialog({ kind: 'promote', system: s })}>
                      Promover a origen
                    </button>
                  )}
                  {archived ? (
                    <button type="button" className={btnNeutral} aria-label={`Desarchivar ${s.name}`} disabled={busy !== null} onClick={() => unarchive(s)}>
                      Desarchivar
                    </button>
                  ) : (
                    <button type="button" className={btnNeutral} aria-label={`Archivar ${s.name}`} onClick={() => setDialog({ kind: 'archive', system: s })}>
                      Archivar
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {dialog?.kind === 'create' && (
        <SystemNameDialog
          title="Crear Sistema Origen"
          initial={campaigns.find((c) => c.id === dialog.campaignId)?.name ?? ''}
          fallback="No se pudo crear el Sistema Origen. Intentá de nuevo."
          onSubmit={async (name) => {
            await data.createOriginFromCampaign(dialog.campaignId, name)
            systems.reload()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <SystemNameDialog
          title="Renombrar sistema"
          initial={dialog.system.name}
          fallback="No se pudo renombrar el sistema. Intentá de nuevo."
          onSubmit={async (name) => {
            await data.renameSystem(dialog.system.id, name)
            systems.reload()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'promote' && (
        <SystemNameDialog
          title="Promover a Sistema Origen"
          initial={dialog.system.name}
          fallback="No se pudo promover el sistema. Intentá de nuevo."
          onSubmit={async (name) => {
            await data.promoteSystem(dialog.system.id, name)
            systems.reload()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'archive' && <ArchiveDialog system={dialog.system} onDone={systems.reload} onClose={() => setDialog(null)} />}
    </>
  )
}

function ArchiveDialog({ system, onDone, onClose }: { system: SystemSummary; onDone: () => void; onClose: () => void }) {
  const data = useHubData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await data.archiveSystem(system.id, true)
      onDone()
      onClose()
    } catch (err) {
      setError(describeDataError(err, 'No se pudo archivar el sistema. Intentá de nuevo.'))
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title="Archivar sistema" confirmLabel="Archivar" busyLabel="Archivando…" busy={busy} error={error} onConfirm={confirm} onClose={onClose}>
      <p>
        «{system.name}» se archiva, no se borra. Los DM dejan de poder usarlo como base de una campaña nueva; las campañas que ya lo copiaron no cambian. Podés desarchivarlo cuando quieras.
      </p>
    </ConfirmDialog>
  )
}
