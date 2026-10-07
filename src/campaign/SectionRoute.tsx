import { Suspense } from 'react'
import { Link, useParams } from 'react-router'
import { btnSecondary } from '../constants'
import { useCampaign } from './CampaignContext'
import { findSection } from './sections'

export function SectionNotFound() {
  const { campaign } = useCampaign()
  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Sección no encontrada</h1>
      <p className="text-sm text-txt-secondary mb-5">Esa sección no existe en esta campaña.</p>
      <Link to={`/c/${campaign.slug}`} className={btnSecondary}>
        Ir al panel
      </Link>
    </>
  )
}

/** `/c/:slug/:section[/:id]`: looks the section up in SECTIONS; unknown or DM-only-for-a-player → 404 in layout. */
export function SectionRoute() {
  const { section: path, id } = useParams()
  const { isDM } = useCampaign()
  const section = findSection(path)
  // A player gets the same 404 as for a typo: nothing reveals that a DM-only section exists.
  if (!section || (section.dmOnly && !isDM)) return <SectionNotFound />
  const Page = section.Component
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-txt-muted">
          Cargando…
        </p>
      }
    >
      <Page key={`${section.key}/${id ?? ''}`} section={section} id={id} />
    </Suspense>
  )
}
