import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { LoadingScreen } from '../app/RouteStatus'
import { btnSecondary } from '../constants'
import { HubPortsProvider } from './adapters/HubPortsProvider'
import { CampaignContext, type CampaignContextValue } from './CampaignContext'
import { CampaignShell } from './CampaignShell'
import { useCampaignLoader } from './useCampaignLoader'

function CampaignMessage({ title, children, action }: { title: string; children: string; action?: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="max-w-sm mx-auto pt-24 px-4 text-center outline-none">
      <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">{title}</h1>
      <p className="text-sm text-txt-secondary mb-5">{children}</p>
      <div className="flex gap-3 justify-center">
        {action}
        <Link to="/" className={btnSecondary}>
          Mis campañas
        </Link>
      </div>
    </main>
  )
}

/** Container for /c/:slug: resolves the campaign + my role, then provides CampaignContext to the section routes. */
export function CampaignLayout() {
  const { slug } = useParams()
  const { load, reload } = useCampaignLoader(slug)

  const ready = load.status === 'ready' ? load : null
  const value = useMemo<CampaignContextValue | null>(
    () =>
      ready
        ? { campaign: ready.campaign, role: ready.role, isDM: ready.role === 'dm', myCharacterIds: ready.myCharacterIds, reload }
        : null,
    [ready, reload],
  )

  if (load.status === 'loading') return <LoadingScreen label="Cargando la campaña…" />
  if (load.status === 'unavailable') {
    return (
      <CampaignMessage title="Campaña no disponible">
        No encontramos esa campaña o no sos parte de ella. Si te invitaron, usá el código de invitación desde tus campañas.
      </CampaignMessage>
    )
  }
  if (load.status === 'error' || !ready || !value) {
    return (
      <CampaignMessage
        title="No pudimos cargar la campaña"
        action={
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        }
      >
        Hubo un problema de conexión. Volvé a intentar en unos segundos.
      </CampaignMessage>
    )
  }
  return (
    <CampaignContext.Provider value={value}>
      <HubPortsProvider>
        <CampaignShell campaign={ready.campaign} isDM={value.isDM} campaigns={ready.campaigns} />
      </HubPortsProvider>
    </CampaignContext.Provider>
  )
}
