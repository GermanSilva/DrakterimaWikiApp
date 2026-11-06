import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { btnPrimary, btnSecondary } from '../constants'
import { ModalShell } from '../campaign/calendar/ModalShell'
import { useAuth } from '../auth'
import type { SystemSummary } from '../data'
import { useHubData } from '../app/DataContext'
import { CampaignList } from './CampaignList'
import { CreateCampaignForm } from './CreateCampaignForm'
import { JoinWithCodeForm } from './JoinWithCodeForm'
import { MyCampaignRequests } from './MyCampaignRequests'
import { MyTemplates } from './MyTemplates'
import { RequestCampaignForm } from './RequestCampaignForm'
import { RequestsInbox } from './RequestsInbox'
import { myTemplates, usableBases } from './systemBases'
import { useIsHubOwner } from './useIsHubOwner'
import { useLoaded } from './useLoaded'
import { useMyCampaigns } from './useMyCampaigns'

const NO_REQUESTS: never[] = []
const NO_SYSTEMS: SystemSummary[] = []

type HubModal = 'request' | 'create' | 'join' | null

export function HubHome() {
  const data = useHubData()
  const navigate = useNavigate()
  const location = useLocation()
  // Set by the campaign deletion redirect through router state. Router state outlives that navigation (reload,
  // back), so it is consumed: kept in local state for this visit and wiped from the history entry.
  const incoming = (location.state as { campaignDeleted?: unknown } | null)?.campaignDeleted
  const [deleted, setDeleted] = useState<string | null>(null)
  if (typeof incoming === 'string' && incoming !== deleted) setDeleted(incoming)
  useEffect(() => {
    if (typeof incoming === 'string') navigate(location, { replace: true, state: null })
  }, [incoming, location, navigate])
  const [modal, setModal] = useState<HubModal>(null)
  const closeModal = useCallback(() => setModal(null), [])
  const { status, campaigns, reload } = useMyCampaigns()
  const { user } = useAuth()
  const userId = user?.id ?? null
  // Hint only (which form to show); the database refuses campaign creation and decisions to anyone else.
  const { isOwner, ready: ownerReady } = useIsHubOwner()
  const mine = useLoaded(userId, () => data.listMyCampaignRequests(userId as string), NO_REQUESTS)
  const inbox = useLoaded(isOwner ? userId : null, () => data.listAllCampaignRequests(), NO_REQUESTS)
  const pending = inbox.value.filter((r) => r.status === 'pending')
  // Bases for the request form and «Mis plantillas»; a failed read just hides both (the default document still applies).
  const bases = useLoaded(userId, () => data.listAvailableSystems(), NO_SYSTEMS)
  const ownerSystems = useLoaded(isOwner ? userId : null, () => data.listAllSystems(), NO_SYSTEMS)

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="brand-gradient-text font-exo text-2xl font-bold tracking-[0.15em] uppercase">Mis campañas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {ownerReady && (
            <button type="button" className={btnPrimary} onClick={() => setModal(isOwner ? 'create' : 'request')}>
              {isOwner ? 'Crear campaña' : 'Solicitar campaña'}
            </button>
          )}
          {isOwner && (
            <Link to="/sistemas" className={btnSecondary}>
              Sistemas
            </Link>
          )}
          <button type="button" className={btnSecondary} onClick={() => setModal('join')}>
            Unirme a campaña
          </button>
        </div>
      </div>
      {deleted !== null && (
        <p role="status" className="mb-4 text-sm text-accent-bright">
          Se borró la campaña «{deleted}».
        </p>
      )}
      {status === 'loading' && campaigns.length === 0 && (
        <p role="status" className="text-sm text-txt-muted">
          Cargando tus campañas…
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="mb-4 text-sm text-accent-bright">
          <p className="mb-2">No pudimos cargar tus campañas.</p>
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {(status === 'ready' || campaigns.length > 0) && <CampaignList campaigns={campaigns} canCreate={isOwner} />}
      <MyTemplates
        templates={myTemplates(bases.value, userId, campaigns)}
        known={bases.value}
        campaigns={campaigns}
        userId={userId}
        onRename={async (id, name) => {
          await data.renameSystem(id, name)
          bases.reload()
        }}
      />

      {isOwner && inbox.status === 'error' && (
        <div role="alert" className="mt-6 text-sm text-accent-bright">
          <p className="mb-2">No pudimos cargar las solicitudes pendientes.</p>
          <button type="button" className={btnSecondary} onClick={inbox.reload}>
            Reintentar
          </button>
        </div>
      )}
      {isOwner && inbox.status !== 'error' && (
        <RequestsInbox
          requests={pending}
          onApprove={(id, overrides) => data.approveCampaignRequest(id, overrides)}
          onReject={(id, note) => data.rejectCampaignRequest(id, note)}
          systems={ownerSystems.value}
          loadApprovalResult={async (id) => {
            const found = (await data.listAllCampaignRequests()).find((r) => r.id === id)
            return { seeded_actions: found?.seeded_actions ?? null, skipped_actions: found?.skipped_actions ?? null }
          }}
          onChanged={inbox.reload}
        />
      )}

      {modal === 'create' && (
        <ModalShell title="Crear campaña" onClose={closeModal}>
          <CreateCampaignForm
            onCreate={async (slug, name, branding) => (await data.createCampaign(slug, name, branding)).slug}
            onCreated={(slug) => navigate(`/c/${slug}`)}
          />
        </ModalShell>
      )}
      {modal === 'request' && (
        <ModalShell title="Solicitar campaña" onClose={closeModal}>
          <RequestCampaignForm
            bases={usableBases(bases.value, userId, campaigns)}
            onRequest={async (request) => {
              await data.createCampaignRequest(request)
              mine.reload()
            }}
          />
        </ModalShell>
      )}
      {modal === 'join' && (
        <ModalShell title="Unirme a campaña" onClose={closeModal}>
          <JoinWithCodeForm onJoin={(code) => navigate(`/invite/${encodeURIComponent(code)}`)} />
        </ModalShell>
      )}

      {mine.status === 'error' && (
        <div role="alert" className="mt-6 text-sm text-accent-bright">
          <p className="mb-2">No pudimos cargar tus solicitudes.</p>
          <button type="button" className={btnSecondary} onClick={mine.reload}>
            Reintentar
          </button>
        </div>
      )}
      <MyCampaignRequests requests={mine.value} campaigns={campaigns} onCancel={(id) => data.cancelCampaignRequest(id)} onChanged={mine.reload} />
    </>
  )
}
