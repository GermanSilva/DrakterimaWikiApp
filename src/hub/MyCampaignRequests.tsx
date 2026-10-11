import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { btnSecondary } from '../constants'
import type { CampaignRequest, CampaignWithRole } from '../data'
import { campaignRequestErrorMessage } from './campaignSlug'

const STATUS_LABEL: Record<CampaignRequest['status'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export interface MyCampaignRequestsProps {
  requests: CampaignRequest[]
  /** The user's campaigns: an approved request links to its campaign when it is in this list. */
  campaigns: CampaignWithRole[]
  /** Resolves false when the request was no longer pending. */
  onCancel: (requestId: number) => Promise<boolean>
  /** Called after a cancel attempt that changed (or revealed) the server state, so the lists reload. */
  onChanged: () => void
}

/** «Mis solicitudes»: the status of every campaign the user asked for, shown in-app (no emails are sent). */
export function MyCampaignRequests({ requests, campaigns, onCancel, onChanged }: MyCampaignRequestsProps) {
  const [busy, setBusy] = useState<number | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)

  if (requests.length === 0) return null

  async function cancel(id: number) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(id)
    setFailure(null)
    try {
      await onCancel(id)
      onChanged()
    } catch (error) {
      setFailure(campaignRequestErrorMessage(error, 'cancel'))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="my-requests-title" className="mt-10 pt-6 border-t border-border-base">
      <h2 id="my-requests-title" className="font-exo text-[13px] font-semibold tracking-[0.2em] uppercase text-accent-bright mb-3">
        Mis solicitudes
      </h2>
      {failure && (
        <p role="alert" className="mb-3 text-sm text-accent-bright">
          {failure}
        </p>
      )}
      <ul className="grid gap-3">
        {requests.map((request) => {
          const campaign = request.campaign_id ? campaigns.find((c) => c.id === request.campaign_id) : undefined
          return (
            <li key={request.id} className="bg-bg-card border border-border-base p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-0 font-exo text-sm font-semibold tracking-[0.08em] uppercase text-txt-primary truncate">
                  {request.name}
                </span>
                <span
                  className={`font-exo text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 border ${
                    request.status === 'rejected' ? 'border-accent-dim text-accent-bright' : 'border-border-light text-txt-secondary'
                  }`}
                >
                  {STATUS_LABEL[request.status]}
                </span>
              </div>
              {request.slug_wanted && <p className="text-xs text-txt-muted mt-1">Dirección pedida: /{request.slug_wanted}</p>}
              {request.status === 'approved' && (
                <p className="text-sm text-txt-secondary mt-2">
                  {campaign ? (
                    <>
                      Tu campaña está lista:{' '}
                      <Link to={`/c/${campaign.slug}`} className="text-accent-bright underline">
                        abrir {campaign.name}
                      </Link>
                      .
                    </>
                  ) : (
                    'Tu campaña fue creada. Si no la ves en «Mis campañas», puede haber sido borrada.'
                  )}
                </p>
              )}
              {request.status === 'rejected' && (
                <p className="text-sm text-txt-secondary mt-2">
                  Rechazada{request.decision_note ? `: ${request.decision_note}` : '.'}
                </p>
              )}
              {request.status === 'pending' && (
                <button type="button" className={`${btnSecondary} mt-3`} disabled={busy !== null} onClick={() => cancel(request.id)}>
                  {busy === request.id ? 'Cancelando…' : 'Cancelar solicitud'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
