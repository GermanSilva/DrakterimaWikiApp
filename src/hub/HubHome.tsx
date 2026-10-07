import { useNavigate } from 'react-router'
import { btnSecondary } from '../constants'
import { useHubData } from '../app/DataContext'
import { CampaignList } from './CampaignList'
import { CreateCampaignForm } from './CreateCampaignForm'
import { JoinWithCodeForm } from './JoinWithCodeForm'
import { useMyCampaigns } from './useMyCampaigns'

export function HubHome() {
  const data = useHubData()
  const navigate = useNavigate()
  const { status, campaigns, reload } = useMyCampaigns()

  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5">Mis campañas</h1>
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
      {(status === 'ready' || campaigns.length > 0) && <CampaignList campaigns={campaigns} />}

      <div className="grid gap-8 md:grid-cols-2 mt-10 pt-6 border-t border-border-base">
        <CreateCampaignForm
          onCreate={async (slug, name) => (await data.createCampaign(slug, name)).slug}
          onCreated={(slug) => navigate(`/c/${slug}`)}
        />
        <JoinWithCodeForm onJoin={(code) => navigate(`/invite/${encodeURIComponent(code)}`)} />
      </div>
    </>
  )
}
