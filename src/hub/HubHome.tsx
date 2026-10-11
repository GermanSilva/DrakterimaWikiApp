import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { btnSecondary } from '../constants'
import { useAuth } from '../auth'
import { useHubData } from '../app/DataContext'
import { CampaignList } from './CampaignList'
import { CreateCampaignForm } from './CreateCampaignForm'
import { JoinWithCodeForm } from './JoinWithCodeForm'
import { MyCampaignRequests } from './MyCampaignRequests'
import { RequestCampaignForm } from './RequestCampaignForm'
import { RequestsInbox } from './RequestsInbox'
import { useIsHubOwner } from './useIsHubOwner'
import { useLoaded } from './useLoaded'
import { useMyCampaigns } from './useMyCampaigns'

const NO_REQUESTS: never[] = []

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
  const { status, campaigns, reload } = useMyCampaigns()
  const { user } = useAuth()
  const userId = user?.id ?? null
  // Hint only (which form to show); the database refuses campaign creation and decisions to anyone else.
  const { isOwner, ready: ownerReady } = useIsHubOwner()
  const mine = useLoaded(userId, () => data.listMyCampaignRequests(userId as string), NO_REQUESTS)
  const inbox = useLoaded(isOwner ? userId : null, () => data.listAllCampaignRequests(), NO_REQUESTS)
  const pending = inbox.value.filter((r) => r.status === 'pending')

  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5">Mis campañas</h1>
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
          onChanged={inbox.reload}
        />
      )}

      <div className="grid gap-8 md:grid-cols-2 mt-10 pt-6 border-t border-border-base">
        {!ownerReady ? (
          <p role="status" className="text-sm text-txt-muted">
            Cargando…
          </p>
        ) : isOwner ? (
          <CreateCampaignForm
            onCreate={async (slug, name) => (await data.createCampaign(slug, name)).slug}
            onCreated={(slug) => navigate(`/c/${slug}`)}
          />
        ) : (
          <RequestCampaignForm
            onRequest={async (request) => {
              await data.createCampaignRequest(request)
              mine.reload()
            }}
          />
        )}
        <JoinWithCodeForm onJoin={(code) => navigate(`/invite/${encodeURIComponent(code)}`)} />
      </div>

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
